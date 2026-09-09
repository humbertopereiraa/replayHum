import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPCOES = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
};

export function extrairToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const cookie = req.cookies?.token;
  if (typeof cookie === 'string' && cookie.length > 0) return cookie;

  return undefined;
}

export function emitirToken(aluno: { id: number; unit_id: number }): string {
  return jwt.sign(
    { studentId: aluno.id, unitId: aluno.unit_id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

export function lerTokenValido(req: Request): { token: string; payload: JwtPayload } | null {
  const token = extrairToken(req);
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
    ...COOKIE_OPCOES,
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export function limparCookieToken(res: Response): void {
  res.clearCookie('token', COOKIE_OPCOES);
}
