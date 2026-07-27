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
