# Task 1: Servidor Backend e Inicialización de Base de Datos SQLite - Report

## Changes Made
- Created `backend/package.json` specifying ESM modules and dependencies (`express`, `sqlite3`, `cors`, `ws`).
- Created `backend/database.js` which handles SQLite (`cobros.db`) database initialization and injects seed data for sucursales, cajeros, employees, clients, and inventory.
- Created `backend/server.js` starting the HTTP Express server on port 5000 and importing database instance.

## Verification
- Installed npm packages successfully.
- Started the server using `npm start`. Logs verified:
  ```
  Servidor de cobro corriendo en http://localhost:5000
  Conectado a SQLite en: C:\Users\Leo\Documents\Mis_Proyectos\Sistema_cobro\backend\cobros.db
  Semillas iniciales insertadas con éxito.
  ```
- Tested API endpoint `/api/health` using `curl.exe` and received expected status output:
  `{"status":"ok","database":"connected"}`
