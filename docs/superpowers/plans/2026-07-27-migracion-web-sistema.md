# Migración a Sistema Web Multiusuario Implementation Plan

**Autores:** Leo (brixtar) & Antigravity (AI Partner)  

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el sistema de cobros actual a una arquitectura cliente-servidor real utilizando NodeJS (Express) como backend, SQLite como base de datos y WebSockets para la comunicación de tickets en tiempo real.

**Architecture:** El backend expondrá una API REST para el control de inventario, turnos, clientes y ventas, y mantendrá conexiones WebSockets bidireccionales con las cajas y básculas locales. SQLite almacenará todas las entidades de forma relacional en un solo archivo físico local (`cobros.db`).

**Tech Stack:** Node.js, Express.js, SQLite (`sqlite3`), WebSocket (`ws`), JavaScript (ESM).

## Global Constraints
- El backend debe correr en Node.js usando módulos ES (`import`/`export`).
- La base de datos SQLite debe guardarse en `backend/cobros.db`.
- Los códigos PIN de autenticación son cadenas numéricas de 4 dígitos.
- La contraseña maestra del administrador es `admin123`.

---

### Task 1: Servidor Backend e Inicialización de Base de Datos SQLite

**Files:**
- Create: `backend/package.json`
- Create: `backend/database.js`
- Create: `backend/server.js`

**Interfaces:**
- Consumes: Ninguna (Punto de inicio).
- Produces: Clase `Database` para inicializar y obtener la base de datos conectada a `cobros.db` con semillas cargadas.

- [ ] **Step 1: Crear el archivo package.json del backend**
  Crear el archivo `backend/package.json` con dependencias mínimas para Express, SQLite y WebSockets.
  ```json
  {
    "name": "sistema-cobro-backend",
    "version": "1.0.0",
    "type": "module",
    "main": "server.js",
    "scripts": {
      "start": "node server.js"
    },
    "dependencies": {
      "cors": "^2.8.5",
      "express": "^4.19.2",
      "sqlite3": "^5.1.7",
      "ws": "^8.16.0"
    }
  }
  ```

- [ ] **Step 2: Crear el módulo database.js para estructurar las tablas de SQLite**
  Crear `backend/database.js` para inicializar y popular la base de datos con las tablas `sucursales`, `cajeros`, `empleados`, `clientes`, `inventario`, `turnos`, `ventas`, `venta_items`, `cola_tickets` y `cola_ticket_items`.
  ```javascript
  import sqlite3 from 'sqlite3';
  import { fileURLToPath } from 'url';
  import path from 'path';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dbPath = path.resolve(__dirname, 'cobros.db');

  export const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
          console.error("Error al abrir base de datos:", err);
      } else {
          console.log("Conectado a SQLite en:", dbPath);
          inicializarTablas();
      }
  });

  function inicializarTablas() {
      db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS sucursales (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL,
              direccion TEXT
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS cajeros (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL UNIQUE,
              pin TEXT NOT NULL,
              activo INTEGER DEFAULT 1
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS empleados (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL UNIQUE,
              sector TEXT NOT NULL,
              pin TEXT NOT NULL
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS clientes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL,
              telefono TEXT,
              limiteCredito REAL DEFAULT 0.0,
              saldo REAL DEFAULT 0.0
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS inventario (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL,
              codigo TEXT UNIQUE NOT NULL,
              precio REAL NOT NULL,
              sector TEXT NOT NULL
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS turnos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sucursalId INTEGER,
              cajeroNombre TEXT NOT NULL,
              inicio TEXT,
              fin TEXT,
              estado TEXT DEFAULT 'abierto',
              saldoInicial REAL,
              saldoEfectivoTeorico REAL,
              saldoVirtualTeorico REAL,
              saldoTarjetaTeorico REAL,
              saldoEfectivoReal REAL,
              discrepanciaEfectivo REAL,
              notes TEXT,
              FOREIGN KEY(sucursalId) REFERENCES sucursales(id)
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS ventas (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sucursalId INTEGER,
              turnoId INTEGER,
              fecha TEXT,
              clienteId INTEGER,
              clienteNombre TEXT,
              total REAL,
              metodoPago TEXT,
              estado TEXT,
              FOREIGN KEY(sucursalId) REFERENCES sucursales(id),
              FOREIGN KEY(turnoId) REFERENCES turnos(id)
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS venta_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ventaId INTEGER,
              productoId INTEGER,
              nombre TEXT,
              precio REAL,
              cantidad REAL,
              FOREIGN KEY(ventaId) REFERENCES ventas(id)
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS cola_tickets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sucursalId INTEGER,
              cajeroNombre TEXT,
              sector TEXT,
              fecha TEXT,
              total REAL,
              estado TEXT DEFAULT 'pendiente',
              FOREIGN KEY(sucursalId) REFERENCES sucursales(id)
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS cola_ticket_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticketId INTEGER,
              productoId INTEGER,
              nombre TEXT,
              precio REAL,
              cantidad REAL,
              FOREIGN KEY(ticketId) REFERENCES cola_tickets(id)
          )`);

          cargarSemillas();
      });
  }

  function cargarSemillas() {
      db.get("SELECT COUNT(*) as count FROM sucursales", [], (err, row) => {
          if (row && row.count === 0) {
              db.run(`INSERT INTO sucursales (id, nombre, direccion) VALUES 
                  (1, 'Sucursal Centro', 'Av. Rivadavia 1200'),
                  (2, 'Sucursal Oeste', 'Ruta 38 Km 4')`);
              
              db.run(`INSERT INTO cajeros (id, nombre, pin) VALUES 
                  (1, 'Carlos', '1111'),
                  (2, 'Ana', '2222'),
                  (3, 'Luis', '3333')`);

              db.run(`INSERT INTO empleados (id, nombre, sector, pin) VALUES 
                  (1, 'Ramiro', 'Fiambrería', '4444'),
                  (2, 'Lucas', 'Almacén', '5555'),
                  (3, 'Gisela', 'Otros', '6666')`);

              db.run(`INSERT INTO clientes (id, nombre, telefono, limiteCredito, saldo) VALUES 
                  (1, 'Consumidor Final', '', 0, 0),
                  (2, 'Carlos Gómez', '3804123456', 15000, -4500),
                  (3, 'Juan Pérez', '3804654321', 6000, -5800),
                  (4, 'Sofía Martínez', '3804888888', 20000, 1500)`);

              db.run(`INSERT INTO inventario (id, nombre, codigo, precio, sector) VALUES 
                  (1, 'Jamón Cocido Lario (Kg)', '101', 8500, 'Fiambrería'),
                  (2, 'Queso Tybo La Paulina (Kg)', '102', 7200, 'Fiambrería'),
                  (3, 'Salamín Milán Tandilero (Kg)', '103', 9500, 'Fiambrería'),
                  (4, 'Yerba Playadito 1Kg', '201', 3400, 'Almacén'),
                  (5, 'Leche Entera Sancor 1L', '202', 1200, 'Almacén'),
                  (6, 'Coca Cola 2.25L', '203', 2500, 'Almacén'),
                  (7, 'Asado de Tira (Kg)', '301', 6500, 'Carnicería'),
                  (8, 'Vacío Novillo (Kg)', '302', 7200, 'Carnicería')`);
              
              console.log("Semillas iniciales insertadas con éxito.");
          }
      });
  }
  ```

- [ ] **Step 3: Crear el servidor server.js básico para levantar Express**
  Crear el archivo `backend/server.js` para iniciar el servidor HTTP en el puerto 5000.
  ```javascript
  import express from 'express';
  import cors from 'cors';
  import { db } from './database.js';

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', database: 'connected' });
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
      console.log(`Servidor de cobro corriendo en http://localhost:${PORT}`);
  });
  ```

- [ ] **Step 4: Comprobar el arranque del servidor y la base de datos**
  Correr e instalar dependencias:
  Ejecutar en la carpeta `backend`:
  `npm install`
  `npm start`
  Verificar que imprima "Conectado a SQLite en... cobros.db" y que la ruta `http://localhost:5000/api/health` responda `{ "status": "ok", "database": "connected" }`.

- [ ] **Step 5: Realizar Commit**
  `git add backend/`
  `git commit -m "feat: backend setup and SQLite database schema with seed data"`

---

### Task 2: Implementación de Endpoints REST del Backend (CRUDs y Turnos)

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: Módulo de base de datos SQLite importado desde `database.js`.
- Produces: APIs REST de autenticación, clientes, productos, turnos, ventas y arqueos.

- [ ] **Step 1: Implementar endpoints de Autenticación y Sucursales**
  Agregar soporte en `backend/server.js` para validar PIN de usuarios y listar sucursales.
  ```javascript
  // Modificar backend/server.js para incluir:
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

  app.get('/api/sucursales', (req, res) => {
      db.all("SELECT * FROM sucursales", [], (err, rows) => {
          res.json(rows || []);
      });
  });
  ```

- [ ] **Step 2: Implementar endpoints de Clientes e Inventario**
  Agregar CRUDs y validación de saldos de clientes.
  ```javascript
  // Modificar backend/server.js para incluir:
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

  app.get('/api/inventario', (req, res) => {
      db.all("SELECT * FROM inventario", [], (err, rows) => {
          res.json(rows || []);
      });
  });
  ```

- [ ] **Step 3: Implementar endpoints de Turnos de Caja (Apertura, Congelación, Auditoría)**
  ```javascript
  // Modificar backend/server.js para incluir:
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
  ```

- [ ] **Step 4: Implementar registro de Ventas e Historial**
  ```javascript
  // Modificar backend/server.js para incluir:
  app.post('/api/ventas', (req, res) => {
      const { sucursalId, turnoId, clienteId, total, metodoPago, items, estado } = req.body;
      
      db.serialize(() => {
          db.run("BEGIN TRANSACTION");
          
          // Registrar la venta
          db.run(`INSERT INTO ventas (sucursalId, turnoId, fecha, clienteId, clienteNombre, total, metodoPago, estado) 
                  VALUES (?, ?, datetime('now', 'localtime'), ?, (SELECT nombre FROM clientes WHERE id = ?), ?, ?, ?)`,
                 [sucursalId, turnoId, clienteId, clienteId, total, metodoPago, estado || 'cobrado'], function(err) {
              if (err) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: err.message });
              }
              const ventaId = this.lastID;
              
              // Registrar items
              const stmt = db.prepare("INSERT INTO venta_items (ventaId, productoId, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)");
              items.forEach(item => {
                  stmt.run(ventaId, item.productoId, item.nombre, item.precio, item.cantidad);
              });
              stmt.finalize();

              // Actualizar cuenta corriente si es corriente o pago de deuda
              if (metodoPago === 'corriente') {
                  db.run("UPDATE clientes SET saldo = saldo - ? WHERE id = ?", [total, clienteId]);
              } else if (estado === 'cobro_deuda') {
                  db.run("UPDATE clientes SET saldo = saldo + ? WHERE id = ?", [total, clienteId]);
              }

              // Actualizar saldos teóricos del turno de caja
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
  ```

- [ ] **Step 5: Validar REST API completa**
  Correr el servidor (`npm start`) y probar con curl una autenticación válida:
  `curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"tipo\":\"cajero\",\"nombre\":\"Carlos\",\"pin\":\"1111\"}"`
  Debe retornar: `{"success":true,"user":"Carlos","rol":"cajero","sector":null}`.

- [ ] **Step 6: Realizar Commit**
  `git add backend/server.js`
  `git commit -m "feat: implement backend REST api controllers for shift audits, auth, sales and clients"`

---

### Task 3: Servidor WebSockets para Tickets y Migración de Frontend React

**Files:**
- Modify: `backend/server.js`
- Create: `backend/websocket.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: Eventos de servidor websocket a través del puerto 5001.
- Produces: Conexión frontend permanente para envío y recepción en tiempo real de tickets de balanzas.

- [ ] **Step 1: Crear servidor de WebSockets en el backend**
  Crear `backend/websocket.js` para inicializar el servidor WS y gestionar las transmisiones de los clientes conectados.
  ```javascript
  import { WebSocketServer } from 'ws';

  let wss;
  const clientesConectados = new Set();

  export function inicializarWebSockets(server) {
      wss = new WebSocketServer({ noServer: true });

      server.on('upgrade', (request, socket, head) => {
          wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
          });
      });

      wss.on('connection', (ws) => {
          clientesConectados.add(ws);
          console.log(`Nueva conexión WebSocket activa. Total: ${clientesConectados.size}`);

          ws.on('close', () => {
              clientesConectados.delete(ws);
              console.log(`Conexión WebSocket cerrada. Total: ${clientesConectados.size}`);
          });
      });
  }

  export function transmitirMensaje(data) {
      const payload = JSON.stringify(data);
      clientesConectados.forEach(client => {
          if (client.readyState === 1) { // OPEN
              client.send(payload);
          }
      });
  }
  ```

- [ ] **Step 2: Integrar WebSockets en el servidor Express**
  Modificar `backend/server.js` para enlazar el servidor HTTP y exponer los WebSockets en el mismo puerto, junto con la ruta de cola de tickets.
  ```javascript
  // Modificar backend/server.js al final para integrar websocket.js
  import http from 'http';
  import { inicializarWebSockets, transmitirMensaje } from './websocket.js';

  // Añadir endpoints de Tickets
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
                  
                  // Emitir evento por WebSockets
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
  ```

- [ ] **Step 3: Actualizar el Frontend index.html para apuntar a la API del Servidor**
  Para asegurar un despliegue directo sin compilar inicialmente un proyecto React grande (o como primera fase estable antes de separar el frontend), modificaremos el archivo central `index.html` para reescribir la clase `Store` para que realice fetches a la API NodeJS en lugar de leer de `localStorage`, y se conecte al WebSocket para recibir los tickets instantáneamente.
  ```javascript
  // Modificar la clase Store en index.html para realizar fetch a http://localhost:5000/api/...
  class Store {
      constructor() {
          this.state = {
              sucursalActiva: 1,
              rolActivo: 'admin',
              usuarioActivo: 'admin',
              sucursales: [],
              cajeros: [],
              empleados: [],
              clientes: [],
              inventario: [],
              turnos: [],
              ventas: [],
              colaTickets: []
          };
          this.initWebSocket();
      }

      async syncData() {
          try {
              const sucursales = await fetch('http://localhost:5000/api/sucursales').then(r => r.json());
              const clientes = await fetch('http://localhost:5000/api/clientes').then(r => r.json());
              const inventario = await fetch('http://localhost:5000/api/inventario').then(r => r.json());
              const turnos = await fetch('http://localhost:5000/api/turnos').then(r => r.json());

              this.state.sucursales = sucursales;
              this.state.clientes = clientes;
              this.state.inventario = inventario;
              this.state.turnos = turnos;

              if (this.state.usuarioActivo !== 'admin') {
                  const name = this.state.usuarioActivo.split(':')[1];
                  if (name) {
                      const pendingTickets = await fetch(`http://localhost:5000/api/tickets/pendiente/${name}`).then(r => r.json());
                      this.state.colaTickets = pendingTickets;
                  }
              }
          } catch(e) {
              console.error("Error al sincronizar con el backend:", e);
          }
      }

      initWebSocket() {
          const ws = new WebSocket(`ws://${window.location.hostname}:5000`);
          ws.onmessage = (event) => {
              const msg = JSON.parse(event.data);
              if (msg.type === 'NUEVO_TICKET') {
                  const ticket = msg.ticket;
                  const activeName = this.state.usuarioActivo.split(':')[1];
                  if (ticket.cajeroNombre === activeName) {
                      this.state.colaTickets.push(ticket);
                      reproducirSonidoBeep(); // Campana visual
                      actualizarBuzonTicketsSectores();
                  }
              }
          };
          ws.onclose = () => {
              setTimeout(() => this.initWebSocket(), 5000); // Reconexión
          };
      }
  }
  ```

- [ ] **Step 4: Comprobar comunicación WebSockets**
  1. Correr el backend (`npm start`).
  2. Abrir `index.html` en el navegador.
  3. Enviar un ticket pesado desde el módulo de Balanza a "Carlos".
  4. Verificar que aparezca instantáneamente en el buzón lateral de la PC de Carlos sin necesidad de recargar la página.

- [ ] **Step 5: Realizar Commit**
  `git add backend/`
  `git add index.html`
  `git commit -m "feat: integrate WebSockets for live scale tickets dispatch and rewrite frontend Store class to fetch REST api"`
