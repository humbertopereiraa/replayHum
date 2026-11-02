jest.mock('jsonwebtoken');
jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { autenticarServidorLocal, autenticarUsuario } from './auth';
import { createMockRequest } from '../test/helpers/mock-request';
import { createMockResponse } from '../test/helpers/mock-response';
import { hashSimples } from '../services/crypto.service';
import type { JwtPayload } from '../types';

const mockVerify = jest.mocked(jwt.verify);
const mockQuery = jest.mocked(pool.query);

function unidadeExiste(id = 1) {
  return { rows: [{ id }], rowCount: 1 };
}

function sessao(unitId = 1, sub = 'google-sub'): JwtPayload {
  return { sub, nome: 'João', unitId };
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticarUsuario', () => {
    it('deve retornar 401 quando não há token', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'não autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve autenticar via cookie token', async () => {
      const payload = sessao();
      mockVerify.mockReturnValue(payload as jwt.JwtPayload);
      mockQuery.mockResolvedValue(unidadeExiste());

      const req = createMockRequest({ cookies: { token: 'jwt-token' } });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('jwt-token', 'jwt-secreto-teste');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM units'), [1]);
      expect(req.googleSub).toBe('google-sub');
      expect(req.usuarioNome).toBe('João');
      expect(req.unitId).toBe(1);
      expect(next).toHaveBeenCalled();
    });

    it('deve autenticar via Authorization Bearer', async () => {
      mockVerify.mockReturnValue(sessao(2, 'outro-sub') as jwt.JwtPayload);
      mockQuery.mockResolvedValue(unidadeExiste(2));

      const req = createMockRequest({
        headers: { authorization: 'Bearer jwt-header-token' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('jwt-header-token', 'jwt-secreto-teste');
      expect(req.googleSub).toBe('outro-sub');
      expect(req.unitId).toBe(2);
      expect(next).toHaveBeenCalled();
    });

    it('deve preferir Bearer quando cookie e header estão presentes', async () => {
      mockVerify.mockReturnValue(sessao(2, 'outro-sub') as jwt.JwtPayload);
      mockQuery.mockResolvedValue(unidadeExiste(2));

      const req = createMockRequest({
        cookies: { token: 'jwt-cookie' },
        headers: { authorization: 'Bearer jwt-header-token' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('jwt-header-token', 'jwt-secreto-teste');
      expect(next).toHaveBeenCalled();
    });

    it('deve retornar 401 quando a unidade não existe', async () => {
      mockVerify.mockReturnValue(sessao(99) as jwt.JwtPayload);
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const req = createMockRequest({ cookies: { token: 'jwt-token' } });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ erro: 'token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando o payload não tem unidade', async () => {
      mockVerify.mockReturnValue({ sub: 'google-sub', nome: 'João' } as jwt.JwtPayload);

      const req = createMockRequest({ cookies: { token: 'jwt-token' } });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

      expect(mockQuery).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando token é inválido', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const req = createMockRequest({ cookies: { token: 'invalido' } });
      const res = createMockResponse();
      const next = jest.fn();

      await autenticarUsuario(req, res, next);

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
        expect.stringContaining('api_key_hash'),
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
