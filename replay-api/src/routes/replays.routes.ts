import express, { Request, Response } from 'express';
import pool from '../config/db';
import { autenticarAluno } from '../middleware/auth';
import { limiteDownload, limiteThumbnail } from '../middleware/rate-limit';
import { gerarUrlDownload } from '../services/b2.service';
import type { Replay } from '../types';

const router = express.Router();

const RETENCAO_HORAS = 48;

router.get('/', autenticarAluno, async (req: Request, res: Response) => {
  const { quadra, data } = req.query as { quadra?: string; data?: string };

  let sql = `SELECT id, quadra, duracao_seg, created_at
             FROM replays WHERE unit_id = $1
             AND created_at > now() - interval '${RETENCAO_HORAS} hours'`;
  const params: unknown[] = [req.unitId];

  if (quadra) {
    params.push(quadra);
    sql += ` AND quadra = $${params.length}`;
  }
  if (data) {
    params.push(data);
    sql += ` AND created_at::date = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id/download', autenticarAluno, limiteDownload, async (req: Request, res: Response) => {
  const { rows } = await pool.query<Replay>(
    `SELECT * FROM replays WHERE id = $1 AND unit_id = $2`,
    [req.params.id, req.unitId]
  );

  const replay = rows[0];
  if (!replay) {
    res.status(404).json({ erro: 'replay não encontrado' });
    return;
  }

  const url = await gerarUrlDownload(replay.b2_key_video, 300, `replay-${replay.id}.mp4`);
  res.json({ url, expira_em_segundos: 300 });
});

router.get(
  '/:id/thumbnail',
  autenticarAluno,
  limiteThumbnail,
  async (req: Request, res: Response) => {
    const { rows } = await pool.query<Replay>(
      `SELECT * FROM replays WHERE id = $1 AND unit_id = $2`,
      [req.params.id, req.unitId]
    );

    const replay = rows[0];
    if (!replay) {
      res.status(404).json({ erro: 'replay não encontrado' });
      return;
    }

    const url = await gerarUrlDownload(replay.b2_key_thumb, 300);
    res.json({ url });
  }
);

export default router;
