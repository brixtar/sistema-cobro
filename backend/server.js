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
