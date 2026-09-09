import express, { Request, Response } from 'express';
import pool from '../config/db';
import { autenticarImportacao } from '../middleware/auth';
import { hashEmail, encryptEmail } from '../services/crypto.service';

const router = express.Router();

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALUNOS_POR_LOTE = 500;

interface AlunoInput {
  nome: string;
  email: string;
}

router.post('/import', autenticarImportacao, async (req: Request, res: Response) => {
  const { alunos } = req.body as { alunos?: AlunoInput[] };

  if (!Array.isArray(alunos) || alunos.length === 0) {
    res.status(400).json({ erro: 'envie um array "alunos" com pelo menos 1 item' });
    return;
  }

  if (alunos.length > MAX_ALUNOS_POR_LOTE) {
    res.status(400).json({ erro: `máximo de ${MAX_ALUNOS_POR_LOTE} alunos por importação` });
    return;
  }

  for (const aluno of alunos) {
    if (!aluno.nome || !aluno.email || !REGEX_EMAIL.test(aluno.email)) {
      res.status(400).json({
        erro: 'cada item precisa de "nome" e "email" válidos',
        item_invalido: aluno,
      });
      return;
    }
  }

  const client = await pool.connect();
  let criados = 0;
  let atualizados = 0;

  try {
    await client.query('BEGIN');

    const hashesProcessados: string[] = [];

    for (const aluno of alunos) {
      const emailHash = hashEmail(aluno.email);
      const emailEncrypted = encryptEmail(aluno.email);
      hashesProcessados.push(emailHash);

      const { rows } = await client.query<{ inserido: boolean }>(
        `INSERT INTO students (unit_id, nome, email_hash, email_encrypted, status)
         VALUES ($1, $2, $3, $4, 'ativo')
         ON CONFLICT (unit_id, email_hash)
         DO UPDATE SET nome = EXCLUDED.nome, status = 'ativo'
         RETURNING (xmax = 0) AS inserido`,
        [req.unitId, aluno.nome, emailHash, emailEncrypted]
      );

      if (rows[0].inserido) criados++;
      else atualizados++;
    }

    const { rowCount: desativados } = await client.query(
      `UPDATE students
       SET status = 'inativo'
       WHERE unit_id = $1 AND status = 'ativo' AND email_hash <> ALL($2::text[])`,
      [req.unitId, hashesProcessados]
    );

    await client.query('COMMIT');

    res.json({
      status: 'importação concluída',
      criados,
      atualizados,
      desativados,
      total_processado: alunos.length,
    });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error(erro);
    res.status(500).json({ erro: 'falha ao importar alunos' });
  } finally {
    client.release();
  }
});

export default router;
