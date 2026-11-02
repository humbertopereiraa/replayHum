import express, { Request, Response } from 'express';
import pool from '../config/db';
import { encryptEmail, hashAcesso, hashEmail } from '../services/crypto.service';
import { verificarTokenGoogle } from '../services/google.service';
import {
  aplicarCookieToken,
  emitirToken,
  limparCookieToken,
} from '../services/auth-token.service';
import { autenticarUsuario } from '../middleware/auth';
import { limiteLoginGooglePorIp } from '../middleware/rate-limit';

const router = express.Router();

type CorpoLogin = {
  credential?: string;
  codigo?: string;
  qrToken?: string;
};

router.post('/google', limiteLoginGooglePorIp, async (req: Request, res: Response) => {
  const { credential, codigo, qrToken } = req.body as CorpoLogin;
  const segredoDigitado = typeof codigo === 'string' ? codigo.trim().toUpperCase() : '';
  const tokenQr = typeof qrToken === 'string' ? qrToken.trim() : '';
  const temCodigo = segredoDigitado.length > 0;
  const temQr = tokenQr.length > 0;

  if (typeof credential !== 'string' || credential.length === 0 || temCodigo === temQr) {
    res.status(400).json({ erro: 'envie o login do Google e exatamente um código de acesso' });
    return;
  }

  const coluna = temCodigo ? 'codigo_acesso_hash' : 'qr_token_hash';
  const hash = hashAcesso(temCodigo ? segredoDigitado : tokenQr);

  const { rows } = await pool.query<{ id: number; nome: string }>(
    `SELECT id, nome FROM units WHERE ${coluna} = $1`,
    [hash]
  );

  const unidade = rows[0];
  if (!unidade) {
    res.status(401).json({ erro: 'código inválido' });
    return;
  }

  const google = await verificarTokenGoogle(credential);
  if (!google) {
    res.status(401).json({ erro: 'login inválido' });
    return;
  }

  await pool.query(
    `INSERT INTO logins (google_sub, nome, email_hash, email_encrypted, unit_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [google.sub, google.nome, hashEmail(google.email), encryptEmail(google.email), unidade.id]
  );

  const token = emitirToken({ sub: google.sub, nome: google.nome, unitId: unidade.id });
  aplicarCookieToken(res, token);

  res.json({
    status: 'autenticado',
    token,
    usuario: { nome: google.nome },
    unidade: { nome: unidade.nome },
  });
});

router.post('/logout', (_req: Request, res: Response) => {
  limparCookieToken(res);
  res.status(204).send();
});

router.get('/me', autenticarUsuario, async (req: Request, res: Response) => {
  const { rows } = await pool.query<{ nome: string }>(
    `SELECT nome FROM units WHERE id = $1`,
    [req.unitId]
  );

  const unidade = rows[0];
  if (!unidade) {
    res.status(404).json({ erro: 'unidade não encontrada' });
    return;
  }

  res.json({
    usuario: { nome: req.usuarioNome },
    unidade: { nome: unidade.nome },
  });
});

export default router;
