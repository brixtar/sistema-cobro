import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.js';
import { inicializarWebSockets, transmitirMensaje } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'connected' });
});

// Autenticación por PIN o contraseña maestra
app.post('/api/auth/login', (req, res) => {
    const { tipo, nombre, pin } = req.body;
    if (tipo === 'admin') {
        if (pin === 'admin123') {
            return res.json({ success: true, user: 'admin', rol: 'admin' });
        }
        return res.status(401).json({ success: false, message: 'Contraseña de administrador incorrecta' });
    }
    
    const tabla = tipo === 'cajero' ? 'cajeros' : 'empleados';
    db.get(`SELECT * FROM ${tabla} WHERE nombre = ? AND pin = ?`, [nombre, pin], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ success: false, message: 'Usuario o código PIN incorrecto' });
        }
        res.json({ success: true, user: row.nombre, rol: tipo === 'cajero' ? 'cajero' : 'sector', sector: row.sector || null });
    });
});

// Sucursales
app.get('/api/sucursales', (req, res) => {
    db.all("SELECT * FROM sucursales", [], (err, rows) => {
        res.json(rows || []);
    });
});

// Clientes
app.get('/api/clientes', (req, res) => {
    db.all("SELECT * FROM clientes", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/clientes', (req, res) => {
    const { nombre, telefono, limiteCredito } = req.body;
    db.run("INSERT INTO clientes (nombre, telefono, limiteCredito, saldo) VALUES (?, ?, ?, 0.0)", [nombre, telefono, limiteCredito], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, nombre, telefono, limiteCredito, saldo: 0.0 });
    });
});

// Inventario
app.get('/api/inventario', (req, res) => {
    db.all("SELECT * FROM inventario", [], (err, rows) => {
        res.json(rows || []);
    });
});

// Turnos de Caja (Apertura, Cierre, Auditoría)
app.get('/api/turnos/activo/:sucursalId', (req, res) => {
    const { sucursalId } = req.params;
    db.get("SELECT * FROM turnos WHERE sucursalId = ? AND estado = 'abierto'", [sucursalId], (err, row) => {
        res.json(row || null);
    });
});

app.post('/api/turnos/abrir', (req, res) => {
    const { sucursalId, cajeroNombre, saldoInicial } = req.body;
    db.run(`INSERT INTO turnos (sucursalId, cajeroNombre, inicio, estado, saldoInicial, saldoEfectivoTeorico, saldoVirtualTeorico, saldoTarjetaTeorico) 
            VALUES (?, ?, datetime('now', 'localtime'), 'abierto', ?, ?, 0, 0)`,
           [sucursalId, cajeroNombre, saldoInicial, saldoInicial], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status: 'abierto' });
    });
});

app.post('/api/turnos/congelar', (req, res) => {
    const { id } = req.body;
    db.run("UPDATE turnos SET estado = 'congelado' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/turnos/auditar', (req, res) => {
    const { id, saldoEfectivoReal, notes } = req.body;
    db.get("SELECT * FROM turnos WHERE id = ?", [id], (err, turno) => {
        if (!turno) return res.status(404).json({ error: "Turno no encontrado" });
        const discrepancia = saldoEfectivoReal - turno.saldoEfectivoTeorico;
        db.run(`UPDATE turnos SET fin = datetime('now', 'localtime'), estado = 'auditado', 
                saldoEfectivoReal = ?, discrepanciaEfectivo = ?, notes = ? WHERE id = ?`,
               [saldoEfectivoReal, discrepancia, notes, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, discrepancia });
        });
    });
});

app.get('/api/turnos', (req, res) => {
    db.all("SELECT * FROM turnos ORDER BY id DESC", [], (err, rows) => {
        res.json(rows || []);
    });
});

// Registro de Ventas / Cobro de Deuda
app.post('/api/ventas', (req, res) => {
    const { sucursalId, turnoId, clienteId, total, metodoPago, items, estado } = req.body;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        db.run(`INSERT INTO ventas (sucursalId, turnoId, fecha, clienteId, clienteNombre, total, metodoPago, estado) 
                VALUES (?, ?, datetime('now', 'localtime'), ?, (SELECT nombre FROM clientes WHERE id = ?), ?, ?, ?)`,
               [sucursalId, turnoId, clienteId, clienteId, total, metodoPago, estado || 'cobrado'], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            const ventaId = this.lastID;
            
            const stmt = db.prepare("INSERT INTO venta_items (ventaId, productoId, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)");
            items.forEach(item => {
                stmt.run(ventaId, item.productoId, item.nombre, item.precio, item.cantidad);
            });
            stmt.finalize();

            // Afectar cuenta corriente si es fiado ('corriente') o abono ('cobro_deuda')
            if (metodoPago === 'corriente') {
                db.run("UPDATE clientes SET saldo = saldo - ? WHERE id = ?", [total, clienteId]);
            } else if (estado === 'cobro_deuda') {
                db.run("UPDATE clientes SET saldo = saldo + ? WHERE id = ?", [total, clienteId]);
            }

            // Afectar saldo teórico de la caja del cajero
            if (metodoPago === 'efectivo') {
                db.run("UPDATE turnos SET saldoEfectivoTeorico = saldoEfectivoTeorico + ? WHERE id = ?", [total, turnoId]);
            } else if (metodoPago === 'virtual') {
                db.run("UPDATE turnos SET saldoVirtualTeorico = saldoVirtualTeorico + ? WHERE id = ?", [total, turnoId]);
            } else if (metodoPago === 'tarjeta') {
                db.run("UPDATE turnos SET saldoTarjetaTeorico = saldoTarjetaTeorico + ? WHERE id = ?", [total, turnoId]);
            }

            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: "Transaction commit failed" });
                res.json({ success: true, ventaId });
            });
        });
    });
});

// Registrar Tickets Externos (balanzas) y transmitir por WebSockets
app.post('/api/tickets', (req, res) => {
    const { sucursalId, cajeroNombre, sector, total, items } = req.body;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run(`INSERT INTO cola_tickets (sucursalId, cajeroNombre, sector, fecha, total, estado) 
                VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'pendiente')`,
               [sucursalId, cajeroNombre, sector, total], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            const ticketId = this.lastID;
            const stmt = db.prepare("INSERT INTO cola_ticket_items (ticketId, productoId, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)");
            items.forEach(item => {
                stmt.run(ticketId, item.productoId, item.nombre, item.precio, item.cantidad);
            });
            stmt.finalize();

            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: "Ticket transaction failed" });
                
                // Transmitir por WebSockets
                const nuevoTicket = {
                    id: ticketId,
                    sucursalId,
                    cajeroNombre,
                    sector,
                    total,
                    items
                };
                transmitirMensaje({ type: 'NUEVO_TICKET', ticket: nuevoTicket });
                res.json({ success: true, ticketId });
            });
        });
    });
});

app.get('/api/tickets/pendiente/:cajeroNombre', (req, res) => {
    const { cajeroNombre } = req.params;
    db.all("SELECT * FROM cola_tickets WHERE cajeroNombre = ? AND estado = 'pendiente'", [cajeroNombre], (err, tickets) => {
        if (err || !tickets) return res.json([]);
        
        let listadoCompletado = [];
        let pending = tickets.length;
        if (pending === 0) return res.json([]);

        tickets.forEach(t => {
            db.all("SELECT * FROM cola_ticket_items WHERE ticketId = ?", [t.id], (err, items) => {
                t.items = items || [];
                listadoCompletado.push(t);
                pending--;
                if (pending === 0) {
                    res.json(listadoCompletado);
                }
            });
        });
    });
});

app.post('/api/tickets/procesar', (req, res) => {
    const { id } = req.body;
    db.run("UPDATE cola_tickets SET estado = 'procesado' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const server = http.createServer(app);
inicializarWebSockets(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Servidor HTTP + WebSockets corriendo en http://localhost:${PORT}`);
});
