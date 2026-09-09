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
  gerarUrlUpload: jest.fn().mockResolvedValue('https://signed-url.test/put'),
  obterMetadadosObjeto: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import pool from '../config/db';
import uploadRoutes from './upload.routes';
import { gerarUrlUpload, obterMetadadosObjeto } from '../services/b2.service';

const mockQuery = jest.mocked(pool.query);
const mockGerarUrlUpload = jest.mocked(gerarUrlUpload);
const mockObterMetadados = jest.mocked(obterMetadadosObjeto);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/upload', uploadRoutes);
  return app;
}

describe('upload.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGerarUrlUpload.mockResolvedValue('https://signed-url.test/put');
    mockQuery.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });
  });

  describe('POST /upload/sign', () => {
    const signValido = {
      quadra: 'Quadra 1',
      video_bytes: 1_000_000,
      thumb_bytes: 20_000,
      duracao_seg: 30,
    };

    it('deve retornar 400 quando quadra está ausente', async () => {
      const response = await request(createApp()).post('/upload/sign').send({
        video_bytes: 1_000_000,
        thumb_bytes: 20_000,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        erro: 'campos obrigatórios: quadra, video_bytes, thumb_bytes',
      });
    });

    it('deve retornar 400 quando a quadra contém path traversal', async () => {
      const response = await request(createApp()).post('/upload/sign').send({
        ...signValido,
        quadra: 'foo/../bar',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ erro: 'quadra inválida' });
      expect(mockGerarUrlUpload).not.toHaveBeenCalled();
    });

    it('deve gerar URLs assinadas com chaves no prefixo da unidade', async () => {
      const response = await request(createApp()).post('/upload/sign').send(signValido);

      expect(response.status).toBe(200);
      expect(response.body.expira_em_segundos).toBe(900);
      expect(response.body.video_key).toMatch(/^1\/Quadra 1\/\d+\.mp4$/);
      expect(response.body.thumb_key).toMatch(/^1\/Quadra 1\/\d+\.jpg$/);
      expect(response.body.video_url).toBe('https://signed-url.test/put');
      expect(response.body.thumb_url).toBe('https://signed-url.test/put');
      expect(mockGerarUrlUpload).toHaveBeenCalledTimes(2);
      expect(mockGerarUrlUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^1\/Quadra 1\/\d+\.mp4$/),
        'video/mp4',
        900,
        1_000_000
      );
      expect(mockGerarUrlUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^1\/Quadra 1\/\d+\.jpg$/),
        'image/jpeg',
        900,
        20_000
      );
    });
  });

  describe('POST /upload/confirm', () => {
    const bodyValido = {
      video_key: '1/Quadra 1/123.mp4',
      thumb_key: '1/Quadra 1/123.jpg',
      quadra: 'Quadra 1',
      duracao_seg: 90,
    };

    it('deve retornar 400 quando campos obrigatórios estão ausentes', async () => {
      const response = await request(createApp()).post('/upload/confirm').send({
        video_key: '1/Quadra 1/123.mp4',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        erro: 'campos obrigatórios: video_key, thumb_key, quadra',
      });
    });

    it('deve retornar 403 quando a chave pertence a outra unidade', async () => {
      const response = await request(createApp()).post('/upload/confirm').send({
        ...bodyValido,
        video_key: '2/Quadra 1/123.mp4',
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ erro: 'chave inválida' });
      expect(mockObterMetadados).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando o objeto ainda não está no B2', async () => {
      mockObterMetadados.mockResolvedValue(null);

      const response = await request(createApp()).post('/upload/confirm').send(bodyValido);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ erro: 'arquivo ainda não está no armazenamento' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando o content-type do vídeo é inválido', async () => {
      mockObterMetadados
        .mockResolvedValueOnce({ tamanho: 1_000_000, contentType: 'application/octet-stream' })
        .mockResolvedValueOnce({ tamanho: 20_000, contentType: 'image/jpeg' });

      const response = await request(createApp()).post('/upload/confirm').send(bodyValido);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ erro: 'tipo do vídeo inválido' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('deve registrar o replay quando os objetos existem', async () => {
      mockObterMetadados
        .mockResolvedValueOnce({ tamanho: 1_000_000, contentType: 'video/mp4' })
        .mockResolvedValueOnce({ tamanho: 20_000, contentType: 'image/jpeg' });

      const response = await request(createApp()).post('/upload/confirm').send(bodyValido);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'recebido', replay_id: 42 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO replays'),
        expect.arrayContaining([1, 'Quadra 1', bodyValido.video_key, bodyValido.thumb_key, 90])
      );
    });

    it('deve persistir duracao_seg como null quando não informada', async () => {
      mockObterMetadados
        .mockResolvedValueOnce({ tamanho: 1_000_000, contentType: 'video/mp4' })
        .mockResolvedValueOnce({ tamanho: 20_000, contentType: 'image/jpeg' });

      await request(createApp()).post('/upload/confirm').send({
        video_key: '1/Quadra 2/123.mp4',
        thumb_key: '1/Quadra 2/123.jpg',
        quadra: 'Quadra 2',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO replays'),
        expect.arrayContaining([1, 'Quadra 2', expect.any(String), expect.any(String), null])
      );
    });

    it('deve retornar 200 com o replay existente quando o confirm é duplicado', async () => {
      mockObterMetadados
        .mockResolvedValueOnce({ tamanho: 1_000_000, contentType: 'video/mp4' })
        .mockResolvedValueOnce({ tamanho: 20_000, contentType: 'image/jpeg' });
      mockQuery
        .mockRejectedValueOnce({ code: '23505' })
        .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 });

      const response = await request(createApp()).post('/upload/confirm').send(bodyValido);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'recebido', replay_id: 7 });
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT id FROM replays'),
        [bodyValido.video_key, 1]
      );
    });
  });
});
