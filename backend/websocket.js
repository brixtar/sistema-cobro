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
