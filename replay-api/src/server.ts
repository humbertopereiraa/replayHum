import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import './types'; // garante que a extensão do Express.Request seja carregada

import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import replaysRoutes from './routes/replays.routes';
import studentsRoutes from './routes/students.routes';
import { limiteGlobal } from './middleware/rate-limit';
import { startSupabaseKeepalive } from './services/supabase-keepalive.service';

const app = express();

app.set('trust proxy', 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    credentials: true,
  })
);
app.use(limiteGlobal);

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
