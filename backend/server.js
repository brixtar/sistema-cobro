import express from 'express';
import cors from 'cors';
import { db } from './database.js';

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor de cobro corriendo en http://localhost:${PORT}`);
});
