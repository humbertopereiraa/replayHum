jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../services/google.service', () => ({
  verificarTokenGoogle: jest.fn(),
}));

jest.mock('jsonwebtoken');

import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import pool from '../config/db';
import authRoutes from './auth.routes';
import { verificarTokenGoogle } from '../services/google.service';
import { encryptEmail, hashAcesso, hashEmail } from '../services/crypto.service';

const mockQuery = jest.mocked(pool.query);
const mockGoogle = jest.mocked(verificarTokenGoogle);
const mockSign = jest.mocked(jwt.sign);
const mockVerify = jest.mocked(jwt.verify);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  return app;
}

const identidade = { sub: 'google-sub', email: 'joao@gmail.com', nome: 'João' };

describe('auth.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSign.mockReturnValue('jwt-token-gerado' as never);
  });

  describe('POST /auth/google', () => {
    it('deve retornar 400 sem o token do Google', async () => {
      const response = await request(createApp()).post('/auth/google').send({ codigo: 'ABCD2345' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        erro: 'envie o login do Google e exatamente um código de acesso',
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando código e QR vêm juntos', async () => {
      const response = await request(createApp())
        .post('/auth/google')
        .send({ credential: 'tok', codigo: 'ABCD2345', qrToken: 'abc' });

      expect(response.status).toBe(400);
      expect(mockGoogle).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando o código não existe e não consulta o Google', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .post('/auth/google')
        .send({ credential: 'tok', codigo: 'abcd2345' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'código inválido' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('codigo_acesso_hash'),
        [hashAcesso('ABCD2345')]
      );
      expect(mockGoogle).not.toHaveBeenCalled();
    });

    it('deve buscar a unidade pelo token do QR', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await request(createApp())
        .post('/auth/google')
        .send({ credential: 'tok', qrToken: 'token-do-qr' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('qr_token_hash'),
        [hashAcesso('token-do-qr')]
      );
    });

    it('deve retornar 401 quando o Google recusa o token, sem gravar login', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 1, nome: 'Arena Central' }], rowCount: 1 });
      mockGoogle.mockResolvedValue(null);

      const response = await request(createApp())
        .post('/auth/google')
        .send({ credential: 'tok', codigo: 'ABCD2345' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'login inválido' });
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deve gravar o login e emitir a sessão', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Arena Central' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockGoogle.mockResolvedValue(identidade);

      const response = await request(createApp())
        .post('/auth/google')
        .send({ credential: 'tok', codigo: 'ABCD2345' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'autenticado',
        token: 'jwt-token-gerado',
        usuario: { nome: 'João' },
        unidade: { nome: 'Arena Central' },
      });
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO logins'),
        ['google-sub', 'João', hashEmail('joao@gmail.com'), expect.any(String), 1]
      );
      const emailCifrado = mockQuery.mock.calls[1][1][3] as string;
      expect(emailCifrado).not.toContain('joao@gmail.com');
      expect(encryptEmail('joao@gmail.com').split(':')).toHaveLength(3);
      expect(mockSign).toHaveBeenCalledWith(
        { sub: 'google-sub', nome: 'João', unitId: 1 },
        'jwt-secreto-teste',
        { expiresIn: '7d' }
      );

      const cookie = response.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toContain('token=jwt-token-gerado');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
    });
  });

  describe('POST /auth/logout', () => {
    it('deve limpar o cookie mesmo sem sessão', async () => {
      const response = await request(createApp()).post('/auth/logout');

      expect(response.status).toBe(204);
      const cookie = response.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toContain('token=');
    });
  });

  describe('GET /auth/me', () => {
    it('deve retornar 401 sem token', async () => {
      const response = await request(createApp()).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'não autenticado' });
    });

    it('deve montar o perfil pelo JWT e pela unidade, sem consultar logins', async () => {
      mockVerify.mockReturnValue({ sub: 'google-sub', nome: 'João Silva', unitId: 1 } as never);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ nome: 'Arena Central' }], rowCount: 1 });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        usuario: { nome: 'João Silva' },
        unidade: { nome: 'Arena Central' },
      });
      const sqls = mockQuery.mock.calls.map((call) => String(call[0]));
      expect(sqls.every((sql) => sql.includes('units'))).toBe(true);
      expect(sqls.some((sql) => sql.includes('logins'))).toBe(false);
    });

    it('deve retornar 401 quando a unidade do token não existe', async () => {
      mockVerify.mockReturnValue({ sub: 'google-sub', nome: 'João', unitId: 1 } as never);
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'token inválido ou expirado' });
    });

    it('deve retornar 404 quando a unidade some depois da autenticação', async () => {
      mockVerify.mockReturnValue({ sub: 'google-sub', nome: 'João', unitId: 1 } as never);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ erro: 'unidade não encontrada' });
    });
  });
});
