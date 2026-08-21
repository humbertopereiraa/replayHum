import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function emitirToken(aluno: { id: number; unit_id: number }): string {
  return jwt.sign(
    { studentId: aluno.id, unitId: aluno.unit_id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

export function lerTokenValido(req: Request): { token: string; payload: JwtPayload } | null {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    return { token, payload };
  } catch {
    return null;
  }
}

export function aplicarCookieToken(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}
