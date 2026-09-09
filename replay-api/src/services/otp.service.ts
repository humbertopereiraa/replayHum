import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';
import pool from '../config/db';
import { hashOtp, hashesIguais } from './crypto.service';
import type { OtpCode } from '../types';

const resend = new Resend(process.env.RESEND_API_KEY);

const TEMPLATE_PATH = path.join(__dirname, '../templates/otp-email.html');
const LOGO_PATH = path.join(__dirname, '../assets/images/logo-replayhum@2x.png');
const LOGO_CONTENT_ID = 'logo-replayhum';

function gerarCodigo(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function escapeHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCodigoHtml(codigo: string): string {
  const digitoStyle =
    "class=\"code-digit\" style=\"font-size:32px;font-weight:700;color:#101828;line-height:1;padding:12px 10px;background-color:#F9FAFB;border-radius:8px;border:1px solid #EAECF0;min-width:36px;text-align:center;\"";
  const espaco = '<td style="width:8px;"></td>';

  return [...codigo]
    .map((digito) => `<td ${digitoStyle}>${digito}</td>`)
    .join(espaco);
}

function montarHtmlEmail(nomeAluno: string, codigo: string): string {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return template
    .replaceAll('{{NOME}}', escapeHtml(nomeAluno))
    .replaceAll('{{CODIGO_HTML}}', renderCodigoHtml(codigo));
}

const VALIDADE_MINUTOS = 5;
const MAX_TENTATIVAS = 5;

export async function solicitarCodigo(
  studentId: number,
  emailDestino: string,
  nomeAluno: string
): Promise<void> {
  const codigo = gerarCodigo();
  const codeHash = hashOtp(codigo);
  const expiresAt = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);

  await pool.query(
    `INSERT INTO otp_codes (student_id, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [studentId, codeHash, expiresAt]
  );

  const html = montarHtmlEmail(nomeAluno, codigo);
  const logoContent = fs.readFileSync(LOGO_PATH).toString('base64');

  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: emailDestino,
    subject: 'Seu código de acesso',
    html,
    text: `Olá, ${nomeAluno}! Seu código de acesso é: ${codigo}\n\nVálido por ${VALIDADE_MINUTOS} minutos.`,
    attachments: [
      {
        content: logoContent,
        filename: 'logo-replayhum.png',
        contentId: LOGO_CONTENT_ID,
      },
    ],
  });
}

export async function verificarCodigo(studentId: number, codigoDigitado: string): Promise<boolean> {
  const { rows } = await pool.query<OtpCode>(
    `SELECT * FROM otp_codes
     WHERE student_id = $1 AND usado = false
     ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );

  const registro = rows[0];
  if (!registro) return false;

  if (new Date() > new Date(registro.expires_at)) return false;
  if (registro.tentativas >= MAX_TENTATIVAS) return false;

  const acertou = hashesIguais(hashOtp(codigoDigitado), registro.code_hash);

  if (acertou) {
    await pool.query(`UPDATE otp_codes SET usado = true WHERE id = $1`, [registro.id]);
  } else {
    await pool.query(
      `UPDATE otp_codes SET tentativas = tentativas + 1 WHERE id = $1`,
      [registro.id]
    );
  }

  return acertou;
}
