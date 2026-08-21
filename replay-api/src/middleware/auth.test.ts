jest.mock('jsonwebtoken');
jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { autenticarAluno, autenticarServidorLocal } from './auth';
import { createMockRequest } from '../test/helpers/mock-request';
import { createMockResponse } from '../test/helpers/mock-response';
import { hashSimples } from '../services/crypto.service';
import type { JwtPayload } from '../types';

const mockVerify = jest.mocked(jwt.verify);
const mockQuery = jest.mocked(pool.query);

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticarAluno', () => {
    it('deve retornar 401 quando não há token', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      autenticarAluno(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'não autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve autenticar via cookie token', () => {
      const payload: JwtPayload = { studentId: 10, unitId: 1 };
      mockVerify.mockReturnValue(payload as jwt.JwtPayload);

      const req = createMockRequest({ cookies: { token: 'jwt-token' } });
      const res = createMockResponse();
      const next = jest.fn();

      autenticarAluno(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('jwt-token', 'jwt-secreto-teste');
      expect(req.studentId).toBe(10);
      expect(req.unitId).toBe(1);
      expect(next).toHaveBeenCalled();
    });

    it('deve autenticar via Authorization Bearer', () => {
      const payload: JwtPayload = { studentId: 20, unitId: 2 };
      mockVerify.mockReturnValue(payload as jwt.JwtPayload);

      const req = createMockRequest({
        headers: { authorization: 'Bearer jwt-header-token' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      autenticarAluno(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('jwt-header-token', 'jwt-secreto-teste');
      expect(req.studentId).toBe(20);
      expect(req.unitId).toBe(2);
      expect(next).toHaveBeenCalled();
    });

    it('deve retornar 401 quando token é inválido', () => {
      mockVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const req = createMockRequest({ cookies: { token: 'invalido' } });
      const res = createMockResponse();
      const next = jest.fn();

      autenticarAluno(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('autenticarServidorLocal', () => {
    it('deve retornar 401 quando API Key não é informada', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarServidorLocal(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'API Key não informada' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando API Key é inválida', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const req = createMockRequest({
        headers: { authorization: 'Bearer chave-invalida' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarServidorLocal(req, res, next);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM units'),
        [hashSimples('chave-invalida')]
      );
      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'API Key inválida' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve autenticar quando API Key é válida', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 5 }], rowCount: 1 });

      const req = createMockRequest({
        headers: { authorization: 'Bearer chave-valida' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarServidorLocal(req, res, next);

      expect(req.unitId).toBe(5);
      expect(next).toHaveBeenCalled();
    });
  });
});
