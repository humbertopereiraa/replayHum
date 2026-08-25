import express, { Request, Response } from 'express';
import pool from '../config/db';
import { hashEmail } from '../services/crypto.service';
import { solicitarCodigo, verificarCodigo } from '../services/otp.service';
import {
  aplicarCookieToken,
  emitirToken,
  lerTokenValido,
} from '../services/auth-token.service';
import { autenticarAluno } from '../middleware/auth';
import type { Student } from '../types';

const router = express.Router();

type PerfilAluno = {
  aluno: { nome: string };
  unidade: { nome: string };
};

async function buscarPerfilAluno(studentId: number): Promise<PerfilAluno | null> {
  const { rows } = await pool.query<{ aluno_nome: string; unidade_nome: string }>(
    `SELECT s.nome AS aluno_nome, u.nome AS unidade_nome
     FROM students s
     JOIN units u ON u.id = s.unit_id
     WHERE s.id = $1 AND s.status = 'ativo'`,
    [studentId]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    aluno: { nome: row.aluno_nome },
    unidade: { nome: row.unidade_nome },
  };
}

router.post('/request-otp', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ erro: 'e-mail é obrigatório' });
    return;
  }

  const emailHash = hashEmail(email);

  const { rows } = await pool.query<Pick<Student, 'id' | 'nome'>>(
    `SELECT id, nome FROM students WHERE email_hash = $1 AND status = 'ativo'`,
    [emailHash]
  );

  if (rows.length === 0) {
    res.status(404).json({ erro: 'e-mail não encontrado. Fale com a administração da sua academia.' });
    return;
  }

  const aluno = rows[0];
  const sessao = lerTokenValido(req);

  if (sessao && sessao.payload.studentId === aluno.id) {
    aplicarCookieToken(res, sessao.token);
    const perfil = await buscarPerfilAluno(aluno.id);
    res.json({
      status: 'autenticado',
      token: sessao.token,
      ...(perfil ?? { aluno: { nome: aluno.nome }, unidade: { nome: '' } }),
    });
    return;
  }

  await solicitarCodigo(aluno.id, email, aluno.nome);
  res.json({ status: 'código enviado' });
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  const { email, codigo } = req.body as { email?: string; codigo?: string };
  if (!email || !codigo) {
    res.status(400).json({ erro: 'e-mail e código são obrigatórios' });
    return;
  }

  const emailHash = hashEmail(email);

  const { rows } = await pool.query<Pick<Student, 'id' | 'unit_id'>>(
    `SELECT id, unit_id FROM students WHERE email_hash = $1 AND status = 'ativo'`,
    [emailHash]
  );

  const aluno = rows[0];
  if (!aluno) {
    res.status(404).json({ erro: 'e-mail não encontrado' });
    return;
  }

  const valido = await verificarCodigo(aluno.id, codigo);
  if (!valido) {
    res.status(401).json({ erro: 'código inválido ou expirado' });
    return;
  }

  const token = emitirToken(aluno);
  aplicarCookieToken(res, token);

  const perfil = await buscarPerfilAluno(aluno.id);
  res.json({
    status: 'autenticado',
    token,
    ...(perfil ?? { aluno: { nome: '' }, unidade: { nome: '' } }),
  });
});

router.get('/me', autenticarAluno, async (req: Request, res: Response) => {
  const perfil = await buscarPerfilAluno(req.studentId!);
  if (!perfil) {
    res.status(404).json({ erro: 'aluno não encontrado' });
    return;
  }

  res.json(perfil);
});

export default router;
