import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import './types'; // garante que a extensão do Express.Request seja carregada

import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import replaysRoutes from './routes/replays.routes';
import studentsRoutes from './routes/students.routes';
import { startSupabaseKeepalive } from './services/supabase-keepalive.service';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  })
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/upload', uploadRoutes);
app.use('/replays', replaysRoutes);
app.use('/students', studentsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
  startSupabaseKeepalive();
});
