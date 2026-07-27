### Task 2: ImplementaciÃ³n de Endpoints REST del Backend (CRUDs y Turnos)

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: MÃ³dulo de base de datos SQLite importado desde `database.js`.
- Produces: APIs REST de autenticaciÃ³n, clientes, productos, turnos, ventas y arqueos.

- [ ] **Step 1: Implementar endpoints de AutenticaciÃ³n y Sucursales**
  Agregar soporte en `backend/server.js` para validar PIN de usuarios y listar sucursales.
  ```javascript
  // Modificar backend/server.js para incluir:
  app.post('/api/auth/login', (req, res) => {
      const { tipo, nombre, pin } = req.body;
      if (tipo === 'admin') {
          if (pin === 'admin123') {
              return res.json({ success: true, user: 'admin', rol: 'admin' });
          }
          return res.status(401).json({ success: false, message: 'ContraseÃ±a de administrador incorrecta' });
      }
      
      const tabla = tipo === 'cajero' ? 'cajeros' : 'empleados';
      db.get(`SELECT * FROM ${tabla} WHERE nombre = ? AND pin = ?`, [nombre, pin], (err, row) => {
          if (err || !row) {
              return res.status(401).json({ success: false, message: 'Usuario o cÃ³digo PIN incorrecto' });
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
  Agregar CRUDs y validaciÃ³n de saldos de clientes.
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

- [ ] **Step 3: Implementar endpoints de Turnos de Caja (Apertura, CongelaciÃ³n, AuditorÃ­a)**
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

              // Actualizar saldos teÃ³ricos del turno de caja
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
  Correr el servidor (`npm start`) y probar con curl una autenticaciÃ³n vÃ¡lida:
  `curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"tipo\":\"cajero\",\"nombre\":\"Carlos\",\"pin\":\"1111\"}"`
  Debe retornar: `{"success":true,"user":"Carlos","rol":"cajero","sector":null}`.

- [ ] **Step 6: Realizar Commit**
  `git add backend/server.js`
  `git commit -m "feat: implement backend REST api controllers for shift audits, auth, sales and clients"`

---


