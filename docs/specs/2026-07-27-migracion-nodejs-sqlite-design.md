# Especificación de Diseño: Migración a Sistema Web Multiusuario (NodeJS + SQLite)

**Caso:** Sistema de Cobros, Caja y Turnos Unificado  
**Fecha:** 2026-07-27  
**Autor:** Leo (brixtar) & Antigravity (AI Partner)  
**Clasificación:** Confidencial / Documento Técnico de Arquitectura  

---

## 1. Introducción y Contexto

El sistema de gestión de cobros y sucursales actual corre enteramente del lado del cliente utilizando almacenamiento en `localStorage`. Para dar el salto a un entorno comercial real con múltiples puestos y sincronización en red (balanzas de fiambrería enviando pedidos a cajas activas, sucursales descentralizadas y auditorías administrativas seguras), se migrará a una arquitectura cliente-servidor real.

Este documento detalla la estructura, el modelo de base de datos relacional y el protocolo en tiempo real que se implementará.

---

## 2. Arquitectura General del Sistema

El sistema constará de dos componentes desacoplados:

1.  **Backend (Servidor API REST & WebSockets):**
    *   **Tecnología:** Node.js con Express.js.
    *   **Base de Datos:** SQLite (archivo local `cobros.db` gestionado mediante el módulo nativo `sqlite3`), garantizando portabilidad sin necesidad de instalar motores de bases de datos pesados.
    *   **Tiempo Real:** Servidor WebSocket (usando `ws` o `socket.io`) para el despacho inmediato de tickets.
2.  **Frontend (Interfaz de Usuario):**
    *   **Tecnología:** React + Vite (migrando la lógica visual oscura y premium del `index.html` original).
    *   **Estilos:** HSL CSS y Tailwind para una estética premium con temática oscura y glassmorphism.

---

## 3. Modelo de Base de Datos Relacional (SQLite)

El backend gestionará el almacenamiento en las siguientes tablas relacionales:

### 3.1. Tabla: `sucursales`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `nombre` (TEXT, Not Null)
*   `direccion` (TEXT)

### 3.2. Tabla: `cajeros`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `nombre` (TEXT, Not Null)
*   `pin` (TEXT, Not Null) - Código PIN encriptado o guardado de forma segura para validación.
*   `activo` (INTEGER, Default 1) - Estado de habilitación (booleano).

### 3.3. Tabla: `empleados`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `nombre` (TEXT, Not Null)
*   `sector` (TEXT, Not Null) - Fiambrería, Carnicería, Almacén, etc.
*   `pin` (TEXT, Not Null) - Código PIN de acceso de 4 dígitos.

### 3.4. Tabla: `clientes`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `nombre` (TEXT, Not Null)
*   `telefono` (TEXT)
*   `limiteCredito` (REAL, Default 0.0)
*   `saldo` (REAL, Default 0.0) - Saldo de cuenta corriente.

### 3.5. Tabla: `inventario`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `nombre` (TEXT, Not Null)
*   `codigo` (TEXT, Unique, Not Null) - Código de barras.
*   `precio` (REAL, Not Null)
*   `sector` (TEXT, Not Null)

### 3.6. Tabla: `turnos`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `sucursalId` (INTEGER, Foreign Key references `sucursales(id)`)
*   `cajeroNombre` (TEXT, Not Null)
*   `inicio` (TEXT) - Fecha y hora de inicio de jornada.
*   `fin` (TEXT) - Fecha y hora de cierre.
*   `estado` (TEXT) - Valores: 'abierto', 'congelado', 'auditado'.
*   `saldoInicial` (REAL)
*   `saldoEfectivoTeorico` (REAL)
*   `saldoVirtualTeorico` (REAL)
*   `saldoTarjetaTeorico` (REAL)
*   `saldoEfectivoReal` (REAL)
*   `discrepanciaEfectivo` (REAL)
*   `notes` (TEXT)

### 3.7. Tabla: `ventas`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `sucursalId` (INTEGER, FK)
*   `turnoId` (INTEGER, FK)
*   `fecha` (TEXT)
*   `clienteId` (INTEGER, FK)
*   `clienteNombre` (TEXT)
*   `total` (REAL)
*   `metodoPago` (TEXT) - efectivo, virtual, tarjeta, corriente
*   `estado` (TEXT) - cobrado, deuda, cobro_deuda

### 3.8. Tabla: `venta_items`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `ventaId` (INTEGER, Foreign Key references `ventas(id)`)
*   `productoId` (INTEGER)
*   `nombre` (TEXT)
*   `precio` (REAL)
*   `cantidad` (REAL)

### 3.9. Tabla: `cola_tickets`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `sucursalId` (INTEGER, FK)
*   `cajeroNombre` (TEXT) - Cajero destinatario del ticket.
*   `sector` (TEXT)
*   `fecha` (TEXT)
*   `total` (REAL)
*   `estado` (TEXT, Default 'pendiente') - 'pendiente' | 'procesado'

### 3.10. Tabla: `cola_ticket_items`
*   `id` (INTEGER, Primary Key, Autoincrement)
*   `ticketId` (INTEGER, Foreign Key references `cola_tickets(id)`)
*   `productoId` (INTEGER)
*   `nombre` (TEXT)
*   `precio` (REAL)
*   `cantidad` (REAL)

---

## 4. Control de Acceso y Seguridad Lógica (Código PIN)

*   **Administrador:** El backend valida el ingreso al módulo administrativo solicitando una contraseña cifrada guardada en configuración.
*   **Personal de Caja y Sectores:** Cada cajero y empleado posee un código PIN de 4 dígitos. Al cambiar de usuario activo en el frontend, se abrirá un teclado numérico en pantalla para autenticar la sesión.
*   **Tokens de Sesión:** El backend firmará las solicitudes con tokens ligeros (ej. JWT) para evitar la suplantación de identidad en las terminales del negocio.

---

## 5. Protocolo de Comunicación en Tiempo Real

Para lograr un buzón de tickets direccionado instantáneo:
1.  **Conexión inicial:** El abrir el POS en el navegador, el cliente establece una conexión WebSocket con el servidor.
2.  **Envío del ticket:** Cuando el empleado de fiambrería pulsa "Enviar a Caja", realiza un `POST` a `/api/tickets`.
3.  **Transmisión:** El backend escribe el ticket en `cola_tickets` y `cola_ticket_items`, y lo transmite de inmediato a través de WebSockets a todos los cajeros de la misma sucursal.
4.  **Recepción:** El navegador receptor filtra el mensaje: si el cajero logueado coincide con el destinatario del ticket, añade el elemento al buzón lateral, reproduce un pitido de confirmación y actualiza el globo de notificaciones en la barra superior.

---

## 6. Plan de Pruebas y Validación

1.  **Pruebas de Red Local (Multidispositivo):** Abrir el sistema en dos computadoras distintas dentro del mismo router (por ejemplo, una notebook para Fiambrería y la PC principal para la Caja) y verificar el despacho y cobro instantáneo del ticket.
2.  **Pruebas de Inyección de Semillas:** Borrar el archivo `cobros.db` y arrancar el servidor; validar que el esquema y los datos iniciales se creen en verde al instante.
3.  **Pruebas de Inmutabilidad de Turnos:** Verificar que un turno en estado 'congelado' o 'auditado' rechace cualquier intento de modificación de importes o inserción de nuevas ventas.
