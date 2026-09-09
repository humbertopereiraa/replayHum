jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../services/otp.service', () => ({
  solicitarCodigo: jest.fn().mockResolvedValue(undefined),
  verificarCodigo: jest.fn(),
}));

jest.mock('jsonwebtoken');

import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import pool from '../config/db';
import authRoutes from './auth.routes';
import { solicitarCodigo, verificarCodigo } from '../services/otp.service';

const mockQuery = jest.mocked(pool.query);
const mockSolicitarCodigo = jest.mocked(solicitarCodigo);
const mockVerificarCodigo = jest.mocked(verificarCodigo);
const mockSign = jest.mocked(jwt.sign);
const mockVerify = jest.mocked(jwt.verify);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  return app;
}

describe('auth.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSign.mockReturnValue('jwt-token-gerado' as never);
  });

  describe('POST /auth/request-otp', () => {
    it('deve retornar 400 quando email não é informado', async () => {
      const response = await request(createApp()).post('/auth/request-otp').send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ erro: 'e-mail é obrigatório' });
    });

    it('deve retornar o mesmo 200 quando email não é encontrado', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .post('/auth/request-otp')
        .send({ email: 'naoexiste@test.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'código enviado' });
      expect(mockSolicitarCodigo).not.toHaveBeenCalled();
    });

    it('deve solicitar código e retornar 200 quando email existe e não há sessão', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 10, nome: 'João' }], rowCount: 1 });

      const response = await request(createApp())
        .post('/auth/request-otp')
        .send({ email: 'aluno@test.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'código enviado' });
      expect(mockSolicitarCodigo).toHaveBeenCalledWith(10, 'aluno@test.com', 'João');
    });

    it('deve devolver token e perfil sem enviar email quando já autenticado', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, nome: 'João' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ aluno_nome: 'João', unidade_nome: 'Arena Central' }],
          rowCount: 1,
        });
      mockVerify.mockReturnValue({ studentId: 10, unitId: 1 } as never);

      const response = await request(createApp())
        .post('/auth/request-otp')
        .set('Cookie', ['token=jwt-existente'])
        .send({ email: 'aluno@test.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'autenticado',
        token: 'jwt-existente',
        aluno: { nome: 'João' },
        unidade: { nome: 'Arena Central' },
      });
      expect(mockSolicitarCodigo).not.toHaveBeenCalled();

      const cookie = response.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toContain('token=jwt-existente');
    });

    it('deve solicitar código quando JWT é de outro aluno', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 10, nome: 'João' }], rowCount: 1 });
      mockVerify.mockReturnValue({ studentId: 99, unitId: 1 } as never);

      const response = await request(createApp())
        .post('/auth/request-otp')
        .set('Cookie', ['token=jwt-outro-aluno'])
        .send({ email: 'aluno@test.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'código enviado' });
      expect(mockSolicitarCodigo).toHaveBeenCalledWith(10, 'aluno@test.com', 'João');
    });

    it('deve solicitar código quando JWT está expirado', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 10, nome: 'João' }], rowCount: 1 });
      mockVerify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const response = await request(createApp())
        .post('/auth/request-otp')
        .set('Cookie', ['token=jwt-expirado'])
        .send({ email: 'aluno@test.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'código enviado' });
      expect(mockSolicitarCodigo).toHaveBeenCalledWith(10, 'aluno@test.com', 'João');
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('deve retornar 400 quando email ou código não são informados', async () => {
      const response = await request(createApp())
        .post('/auth/verify-otp')
        .send({ email: 'aluno@test.com' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ erro: 'e-mail e código são obrigatórios' });
    });

    it('deve retornar 401 quando aluno não existe', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .post('/auth/verify-otp')
        .send({ email: 'aluno@test.com', codigo: '123456' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'código inválido ou expirado' });
    });

    it('deve retornar 401 quando código é inválido', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 10, unit_id: 1 }], rowCount: 1 });
      mockVerificarCodigo.mockResolvedValue(false);

      const response = await request(createApp())
        .post('/auth/verify-otp')
        .send({ email: 'aluno@test.com', codigo: '000000' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'código inválido ou expirado' });
    });

    it('deve autenticar, emitir JWT, definir cookie e devolver perfil', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, unit_id: 1 }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ aluno_nome: 'João', unidade_nome: 'Arena Central' }],
          rowCount: 1,
        });
      mockVerificarCodigo.mockResolvedValue(true);

      const response = await request(createApp())
        .post('/auth/verify-otp')
        .send({ email: 'aluno@test.com', codigo: '123456' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'autenticado',
        token: 'jwt-token-gerado',
        aluno: { nome: 'João' },
        unidade: { nome: 'Arena Central' },
      });
      expect(mockSign).toHaveBeenCalledWith(
        { studentId: 10, unitId: 1 },
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

    it('deve retornar perfil do aluno autenticado', async () => {
      mockVerify.mockReturnValue({ studentId: 10, unitId: 1 } as never);
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 10, unit_id: 1, status: 'ativo' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ aluno_nome: 'João Silva', unidade_nome: 'Arena Central' }],
          rowCount: 1,
        });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        aluno: { nome: 'João Silva' },
        unidade: { nome: 'Arena Central' },
      });
    });

    it('deve retornar 401 quando o aluno está inativo', async () => {
      mockVerify.mockReturnValue({ studentId: 10, unitId: 1 } as never);
      mockQuery.mockResolvedValue({
        rows: [{ id: 10, unit_id: 1, status: 'inativo' }],
        rowCount: 1,
      });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ erro: 'token inválido ou expirado' });
    });

    it('deve retornar 404 quando o perfil não é encontrado', async () => {
      mockVerify.mockReturnValue({ studentId: 10, unitId: 1 } as never);
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 10, unit_id: 1, status: 'ativo' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(createApp())
        .get('/auth/me')
        .set('Cookie', ['token=jwt-existente']);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ erro: 'aluno não encontrado' });
    });
  });
});
