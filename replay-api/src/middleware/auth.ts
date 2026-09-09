import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { hashSimples } from '../services/crypto.service';
import { extrairToken } from '../services/auth-token.service';
import type { JwtPayload, Student, Unit } from '../types';

export async function autenticarAluno(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extrairToken(req);

  if (!token) {
    res.status(401).json({ erro: 'não autenticado' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    const { rows } = await pool.query<Pick<Student, 'id' | 'unit_id' | 'status'>>(
      `SELECT id, unit_id, status FROM students WHERE id = $1`,
      [payload.studentId]
    );

    const aluno = rows[0];
    if (!aluno || aluno.status !== 'ativo') {
      res.status(401).json({ erro: 'token inválido ou expirado' });
      return;
    }

    req.studentId = aluno.id;
    req.unitId = aluno.unit_id;
    next();
  } catch {
    res.status(401).json({ erro: 'token inválido ou expirado' });
  }
}

export async function autenticarServidorLocal(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await autenticarPorHashDeUnidade(req, res, next, 'api_key_hash');
}

export async function autenticarImportacao(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await autenticarPorHashDeUnidade(req, res, next, 'import_api_key_hash');
}

async function autenticarPorHashDeUnidade(
  req: Request,
  res: Response,
  next: NextFunction,
  coluna: 'api_key_hash' | 'import_api_key_hash'
): Promise<void> {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({ erro: 'API Key não informada' });
    return;
  }

  const apiKeyHash = hashSimples(apiKey);
  const { rows } = await pool.query<Pick<Unit, 'id'>>(
    `SELECT id FROM units WHERE ${coluna} = $1`,
    [apiKeyHash]
  );

  if (rows.length === 0) {
    res.status(401).json({ erro: 'API Key inválida' });
    return;
  }

  req.unitId = rows[0].id;
  next();
}
