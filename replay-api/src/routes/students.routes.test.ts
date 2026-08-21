import type { NextFunction, Request, Response } from 'express';

jest.mock('../middleware/auth', () => ({
  autenticarServidorLocal: (req: Request, _res: Response, next: NextFunction) => {
    req.unitId = 1;
    next();
  },
}));

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock('../config/db', () => ({
  __esModule: true,
  default: { connect: (...args: unknown[]) => mockConnect(...args) },
}));

import express from 'express';
import request from 'supertest';
import studentsRoutes from './students.routes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/students', studentsRoutes);
  return app;
}

describe('students.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  it('deve retornar 400 quando alunos não é um array válido', async () => {
    const response = await request(createApp())
      .post('/students/import')
      .send({ alunos: [] });

    expect(response.status).toBe(400);
    expect(response.body.erro).toContain('array "alunos"');
  });

  it('deve retornar 400 quando item tem email inválido', async () => {
    const response = await request(createApp())
      .post('/students/import')
      .send({ alunos: [{ nome: 'João', email: 'email-invalido' }] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      erro: 'cada item precisa de "nome" e "email" válidos',
      item_invalido: { nome: 'João', email: 'email-invalido' },
    });
  });

  it('deve importar alunos com sucesso', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ inserido: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ inserido: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce(undefined);

    const response = await request(createApp())
      .post('/students/import')
      .send({
        alunos: [
          { nome: 'João', email: 'joao@test.com' },
          { nome: 'Maria', email: 'maria@test.com' },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'importação concluída',
      criados: 1,
      atualizados: 1,
      desativados: 2,
      total_processado: 2,
    });

    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('deve fazer rollback e retornar 500 em caso de erro', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('falha no insert'))
      .mockResolvedValueOnce(undefined);

    const response = await request(createApp())
      .post('/students/import')
      .send({ alunos: [{ nome: 'João', email: 'joao@test.com' }] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ erro: 'falha ao importar alunos' });
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });
});
