import express, { Request, Response } from 'express';
import pool from '../config/db';
import { autenticarServidorLocal } from '../middleware/auth';
import { gerarUrlUpload, obterMetadadosObjeto } from '../services/b2.service';

const router = express.Router();

const EXPIRA_UPLOAD_SEG = 900;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_THUMB_BYTES = 5 * 1024 * 1024;
const MAX_QUADRA_CHARS = 100;

router.post('/sign', autenticarServidorLocal, async (req: Request, res: Response) => {
  const { quadra, video_bytes, thumb_bytes } = req.body as {
    quadra?: string;
    video_bytes?: unknown;
    thumb_bytes?: unknown;
  };

  const nomeQuadra = sanitizarQuadra(quadra);
  const videoBytes = parseBytes(video_bytes);
  const thumbBytes = parseBytes(thumb_bytes);

  if (typeof quadra === 'string' && quadra.trim() && !nomeQuadra) {
    res.status(400).json({ erro: 'quadra inválida' });
    return;
  }

  if (!nomeQuadra || videoBytes === null || thumbBytes === null) {
    res.status(400).json({ erro: 'campos obrigatórios: quadra, video_bytes, thumb_bytes' });
    return;
  }

  if (videoBytes > MAX_VIDEO_BYTES) {
    res.status(400).json({ erro: 'tamanho do vídeo inválido' });
    return;
  }

  if (thumbBytes > MAX_THUMB_BYTES) {
    res.status(400).json({ erro: 'tamanho da thumbnail inválido' });
    return;
  }

  const timestamp = Date.now();
  const videoKey = `${req.unitId}/${nomeQuadra}/${timestamp}.mp4`;
  const thumbKey = `${req.unitId}/${nomeQuadra}/${timestamp}.jpg`;

  const [videoUrl, thumbUrl] = await Promise.all([
    gerarUrlUpload(videoKey, 'video/mp4', EXPIRA_UPLOAD_SEG, videoBytes),
    gerarUrlUpload(thumbKey, 'image/jpeg', EXPIRA_UPLOAD_SEG, thumbBytes),
  ]);

  res.json({
    video_key: videoKey,
    thumb_key: thumbKey,
    video_url: videoUrl,
    thumb_url: thumbUrl,
    expira_em_segundos: EXPIRA_UPLOAD_SEG,
  });
});

router.post('/confirm', autenticarServidorLocal, async (req: Request, res: Response) => {
  const { video_key, thumb_key, quadra, duracao_seg } = req.body as {
    video_key?: string;
    thumb_key?: string;
    quadra?: string;
    duracao_seg?: unknown;
  };

  if (!video_key || !thumb_key || !quadra) {
    res.status(400).json({ erro: 'campos obrigatórios: video_key, thumb_key, quadra' });
    return;
  }

  const prefixoUnidade = `${req.unitId}/`;
  if (!video_key.startsWith(prefixoUnidade) || !thumb_key.startsWith(prefixoUnidade)) {
    res.status(403).json({ erro: 'chave inválida' });
    return;
  }

  const [video, thumb] = await Promise.all([
    obterMetadadosObjeto(video_key),
    obterMetadadosObjeto(thumb_key),
  ]);

  if (!video || !thumb) {
    res.status(400).json({ erro: 'arquivo ainda não está no armazenamento' });
    return;
  }

  if (video.tamanho <= 0 || video.tamanho > MAX_VIDEO_BYTES) {
    res.status(400).json({ erro: 'tamanho do vídeo inválido' });
    return;
  }

  if (thumb.tamanho <= 0 || thumb.tamanho > MAX_THUMB_BYTES) {
    res.status(400).json({ erro: 'tamanho da thumbnail inválido' });
    return;
  }

  if (!tipoCompativel(video.contentType, 'video/mp4')) {
    res.status(400).json({ erro: 'tipo do vídeo inválido' });
    return;
  }

  if (!tipoCompativel(thumb.contentType, 'image/jpeg')) {
    res.status(400).json({ erro: 'tipo da thumbnail inválido' });
    return;
  }

  const duracao = parseDuracao(duracao_seg);

  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO replays (unit_id, quadra, b2_key_video, b2_key_thumb, duracao_seg)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.unitId, quadra, video_key, thumb_key, duracao]
    );

    res.status(201).json({ status: 'recebido', replay_id: rows[0].id });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }

    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM replays WHERE b2_key_video = $1 AND unit_id = $2`,
      [video_key, req.unitId]
    );

    if (!rows[0]) {
      throw err;
    }

    res.status(200).json({ status: 'recebido', replay_id: rows[0].id });
  }
});

function sanitizarQuadra(quadra: unknown): string | null {
  if (typeof quadra !== 'string') return null;
  const nome = quadra.trim();
  if (!nome || nome.length > MAX_QUADRA_CHARS) return null;
  if (nome.includes('/') || nome.includes('\\') || nome.includes('..')) return null;
  return nome;
}

function parseBytes(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function tipoCompativel(atual: string | undefined, esperado: string): boolean {
  return (atual ?? '').toLowerCase().split(';')[0].trim() === esperado;
}

function parseDuracao(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '23505');
}

export default router;
