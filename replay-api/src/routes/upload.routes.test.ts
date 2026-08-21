import type { NextFunction, Request, Response } from 'express';

jest.mock('../middleware/auth', () => ({
  autenticarServidorLocal: (req: Request, _res: Response, next: NextFunction) => {
    req.unitId = 1;
    next();
  },
}));

jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../services/b2.service', () => ({
  enviarArquivo: jest.fn().mockResolvedValue('chave'),
}));

import express from 'express';
import request from 'supertest';
import pool from '../config/db';
import uploadRoutes from './upload.routes';
import { enviarArquivo } from '../services/b2.service';

const mockQuery = jest.mocked(pool.query);
const mockEnviarArquivo = jest.mocked(enviarArquivo);

function createApp() {
  const app = express();
  app.use('/upload', uploadRoutes);
  return app;
}

describe('upload.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnviarArquivo.mockImplementation(async (chave: string) => chave);
    mockQuery.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });
  });

  it('deve retornar 400 quando campos obrigatórios estão ausentes', async () => {
    const response = await request(createApp())
      .post('/upload')
      .field('quadra', 'Quadra 1');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'campos obrigatórios: quadra, video, thumb',
    });
  });

  it('deve fazer upload completo e registrar replay', async () => {
    const response = await request(createApp())
      .post('/upload')
      .field('quadra', 'Quadra 1')
      .field('duracao_seg', '90')
      .attach('video', Buffer.from('video'), { filename: 'video.mp4', contentType: 'video/mp4' })
      .attach('thumb', Buffer.from('thumb'), { filename: 'thumb.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ status: 'recebido', replay_id: 42 });
    expect(mockEnviarArquivo).toHaveBeenCalledTimes(2);
    expect(mockEnviarArquivo).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/Quadra 1\/\d+\.mp4$/),
      expect.any(Buffer),
      'video/mp4'
    );
    expect(mockEnviarArquivo).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/Quadra 1\/\d+\.jpg$/),
      expect.any(Buffer),
      'image/jpeg'
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO replays'),
      expect.arrayContaining([1, 'Quadra 1', expect.any(String), expect.any(String), 90])
    );
  });

  it('deve persistir duracao_seg como null quando não informada', async () => {
    await request(createApp())
      .post('/upload')
      .field('quadra', 'Quadra 2')
      .attach('video', Buffer.from('video'), { filename: 'video.mp4', contentType: 'video/mp4' })
      .attach('thumb', Buffer.from('thumb'), { filename: 'thumb.jpg', contentType: 'image/jpeg' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO replays'),
      expect.arrayContaining([1, 'Quadra 2', expect.any(String), expect.any(String), null])
    );
  });
});
