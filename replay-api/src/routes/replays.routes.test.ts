import type { NextFunction, Request, Response } from 'express';

jest.mock('../middleware/auth', () => ({
  autenticarAluno: (req: Request, _res: Response, next: NextFunction) => {
    req.unitId = 1;
    req.studentId = 10;
    next();
  },
}));

jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../services/b2.service', () => ({
  gerarUrlDownload: jest.fn().mockResolvedValue('https://signed-url.test/video'),
}));

import express from 'express';
import request from 'supertest';
import pool from '../config/db';
import replaysRoutes from './replays.routes';
import { gerarUrlDownload } from '../services/b2.service';
import { createReplay } from '../test/helpers/fixtures';

const mockQuery = jest.mocked(pool.query);
const mockGerarUrlDownload = jest.mocked(gerarUrlDownload);

function createApp() {
  const app = express();
  app.use('/replays', replaysRoutes);
  return app;
}

describe('replays.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGerarUrlDownload.mockResolvedValue('https://signed-url.test/arquivo');
  });

  describe('GET /replays', () => {
    it('deve listar replays da unidade', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 1, quadra: 'Quadra 1', duracao_seg: 120, created_at: new Date() }],
        rowCount: 1,
      });

      const response = await request(createApp()).get('/replays');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: 1,
        quadra: 'Quadra 1',
        duracao_seg: 120,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unit_id = $1'),
        [1]
      );
    });

    it('deve filtrar por quadra e data', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await request(createApp()).get('/replays').query({ quadra: 'Quadra 2', data: '2026-01-15' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/quadra = \$2.*created_at::date = \$3/s),
        [1, 'Quadra 2', '2026-01-15']
      );
    });
  });

  describe('GET /replays/:id/download', () => {
    it('deve retornar 404 quando replay não existe', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp()).get('/replays/99/download');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ erro: 'replay não encontrado' });
    });

    it('deve retornar URL de download', async () => {
      const replay = createReplay({ id: 5, b2_key_video: '1/quadra/video.mp4' });
      mockQuery.mockResolvedValue({ rows: [replay], rowCount: 1 });

      const response = await request(createApp()).get('/replays/5/download');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        url: 'https://signed-url.test/arquivo',
        expira_em_segundos: 300,
      });
      expect(mockGerarUrlDownload).toHaveBeenCalledWith('1/quadra/video.mp4', 300);
    });
  });

  describe('GET /replays/:id/thumbnail', () => {
    it('deve retornar 404 quando replay não existe', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp()).get('/replays/99/thumbnail');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ erro: 'replay não encontrado' });
    });

    it('deve retornar URL da thumbnail', async () => {
      const replay = createReplay({ id: 5, b2_key_thumb: '1/quadra/thumb.jpg' });
      mockQuery.mockResolvedValue({ rows: [replay], rowCount: 1 });

      const response = await request(createApp()).get('/replays/5/thumbnail');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://signed-url.test/arquivo' });
      expect(mockGerarUrlDownload).toHaveBeenCalledWith('1/quadra/thumb.jpg', 300);
    });
  });
});
