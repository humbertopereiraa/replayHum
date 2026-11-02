import { OAuth2Client } from 'google-auth-library';

const cliente = new OAuth2Client();

export type IdentidadeGoogle = {
  sub: string;
  email: string;
  nome: string;
};

export async function verificarTokenGoogle(credential: string): Promise<IdentidadeGoogle | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !credential) return null;

  try {
    const ticket = await cliente.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) return null;

    const nome = payload.name?.trim() || payload.email;
    return { sub: payload.sub, email: payload.email, nome };
  } catch {
    return null;
  }
}
