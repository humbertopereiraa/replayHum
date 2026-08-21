import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { hashSimples } from '../services/crypto.service';
import type { JwtPayload, Unit } from '../types';

export function autenticarAluno(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ erro: 'não autenticado' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.studentId = payload.studentId;
    req.unitId = payload.unitId;
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
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({ erro: 'API Key não informada' });
    return;
  }

  const apiKeyHash = hashSimples(apiKey);

  const { rows } = await pool.query<Pick<Unit, 'id'>>(
    `SELECT id FROM units WHERE api_key_hash = $1`,
    [apiKeyHash]
  );

  if (rows.length === 0) {
    res.status(401).json({ erro: 'API Key inválida' });
    return;
  }

  req.unitId = rows[0].id;
  next();
}
