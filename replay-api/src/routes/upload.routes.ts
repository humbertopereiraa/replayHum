import express, { Request, Response } from 'express';
import multer from 'multer';
import pool from '../config/db';
import { autenticarServidorLocal } from '../middleware/auth';
import { enviarArquivo } from '../services/b2.service';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.post(
  '/',
  autenticarServidorLocal,
  upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]),
  async (req: Request, res: Response) => {
    const { quadra, duracao_seg } = req.body as { quadra?: string; duracao_seg?: string };

    const arquivos = req.files as { [campo: string]: Express.Multer.File[] } | undefined;
    const arquivoVideo = arquivos?.video?.[0];
    const arquivoThumb = arquivos?.thumb?.[0];

    if (!quadra || !arquivoVideo || !arquivoThumb) {
      res.status(400).json({ erro: 'campos obrigatórios: quadra, video, thumb' });
      return;
    }

    const timestamp = Date.now();
    const chaveVideo = `${req.unitId}/${quadra}/${timestamp}.mp4`;
    const chaveThumb = `${req.unitId}/${quadra}/${timestamp}.jpg`;

    await enviarArquivo(chaveVideo, arquivoVideo.buffer, 'video/mp4');
    await enviarArquivo(chaveThumb, arquivoThumb.buffer, 'image/jpeg');

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO replays (unit_id, quadra, b2_key_video, b2_key_thumb, duracao_seg)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.unitId, quadra, chaveVideo, chaveThumb, duracao_seg ? Number(duracao_seg) : null]
    );

    res.status(201).json({ status: 'recebido', replay_id: rows[0].id });
  }
);

export default router;
