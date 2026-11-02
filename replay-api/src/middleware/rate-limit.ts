import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

const MENSAGEM_429 = { erro: 'muitas tentativas, tente em instantes' };

function emTeste(): boolean {
  return process.env.NODE_ENV === 'test';
}

function responder429(_req: Request, res: Response): void {
  res.status(429).json(MENSAGEM_429);
}

function chaveIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? '0.0.0.0');
}

export const limiteGlobal = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => emTeste() || req.path === '/health',
  handler: responder429,
  keyGenerator: chaveIp,
});

export const limiteLoginGooglePorIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: emTeste,
  handler: responder429,
  keyGenerator: chaveIp,
});

export const limiteDownload = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: emTeste,
  handler: responder429,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => `download:${req.googleSub ?? chaveIp(req)}`,
});

export const limiteThumbnail = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: emTeste,
  handler: responder429,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => `thumb:${req.googleSub ?? chaveIp(req)}`,
});
