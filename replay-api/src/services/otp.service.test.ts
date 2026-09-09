jest.mock('resend', () => {
  const send = jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null });

  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send },
    })),
  };
});

jest.mock('../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import { Resend } from 'resend';
import pool from '../config/db';
import { hashOtp } from './crypto.service';
import { solicitarCodigo, verificarCodigo } from './otp.service';
import { createOtpCode } from '../test/helpers/fixtures';

const mockQuery = jest.mocked(pool.query);
const MockResend = jest.mocked(Resend);
const mockSend = (
  MockResend.mock.results[0]?.value as { emails: { send: jest.Mock } }
).emails.send;

describe('otp.service', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockQuery.mockClear();
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
  });

  describe('solicitarCodigo', () => {
    it('deve inserir OTP no banco e enviar email via Resend', async () => {
      const antes = Date.now();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await solicitarCodigo(10, 'aluno@test.com', 'Maria');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO otp_codes'),
        expect.arrayContaining([
          10,
          expect.stringMatching(/^[0-9a-f]{64}$/),
          expect.any(Date),
        ])
      );

      const expiresAt = mockQuery.mock.calls[0][1]?.[2] as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(antes + 4 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(antes + 6 * 60 * 1000);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'aluno@test.com',
          subject: 'Seu código de acesso',
          html: expect.stringContaining('Maria'),
          text: expect.stringContaining('Maria'),
          attachments: [
            expect.objectContaining({
              filename: 'logo-replayhum.png',
              contentId: 'logo-replayhum',
              content: expect.any(String),
            }),
          ],
        })
      );

      const payload = mockSend.mock.calls[0][0] as { html: string; text: string };
      expect(payload.html).toContain('cid:logo-replayhum');
      const digitos = [...payload.html.matchAll(/class="code-digit"[^>]*>(\d)</g)].map((m) => m[1]);
      expect(digitos).toHaveLength(6);
      const codigo = digitos.join('');
      expect(payload.html).not.toContain('{{NOME}}');
      expect(payload.html).not.toContain('{{CODIGO_HTML}}');
      expect(payload.text).toContain(codigo);
    });

    it('deve escapar HTML no nome do aluno', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await solicitarCodigo(10, 'aluno@test.com', '<img src=x onerror=alert(1)>');

      const payload = mockSend.mock.calls[0][0] as { html: string; text: string };
      expect(payload.html).not.toContain('<img src=x');
      expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(payload.text).toContain('<img src=x onerror=alert(1)>');
    });
  });

  describe('verificarCodigo', () => {
    it('deve retornar false quando não há registro', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const resultado = await verificarCodigo(10, '123456');

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando o código expirou', async () => {
      const registro = createOtpCode({
        expires_at: new Date(Date.now() - 60 * 1000),
      });
      mockQuery.mockResolvedValue({ rows: [registro], rowCount: 1 });

      const resultado = await verificarCodigo(10, '123456');

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando tentativas >= 5', async () => {
      const registro = createOtpCode({ tentativas: 5 });
      mockQuery.mockResolvedValue({ rows: [registro], rowCount: 1 });

      const resultado = await verificarCodigo(10, '123456');

      expect(resultado).toBe(false);
    });

    it('deve retornar true e marcar como usado quando o hash confere', async () => {
      const codigo = '654321';
      const registro = createOtpCode({ code_hash: hashOtp(codigo) });
      mockQuery
        .mockResolvedValueOnce({ rows: [registro], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const resultado = await verificarCodigo(10, codigo);

      expect(resultado).toBe(true);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('SET usado = true'),
        [registro.id]
      );
    });

    it('deve retornar false e incrementar tentativas quando o hash não confere', async () => {
      const registro = createOtpCode({ code_hash: hashOtp('111111') });
      mockQuery
        .mockResolvedValueOnce({ rows: [registro], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const resultado = await verificarCodigo(10, '999999');

      expect(resultado).toBe(false);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('tentativas = tentativas + 1'),
        [registro.id]
      );
    });
  });
});
