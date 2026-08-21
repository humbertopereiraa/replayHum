import crypto from 'crypto';

export function hashEmail(email: string): string {
  const chave = process.env.EMAIL_HASH_KEY!;
  return crypto
    .createHmac('sha256', chave)
    .update(email.trim().toLowerCase())
    .digest('hex');
}

export function encryptEmail(email: string): string {
  const chave = Buffer.from(process.env.EMAIL_ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);

  const cifrado = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${cifrado.toString('hex')}`;
}

export function decryptEmail(valorCifrado: string): string {
  const chave = Buffer.from(process.env.EMAIL_ENCRYPTION_KEY!, 'hex');
  const [ivHex, tagHex, dadosHex] = valorCifrado.split(':');

  const decipher = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const texto = Buffer.concat([
    decipher.update(Buffer.from(dadosHex, 'hex')),
    decipher.final(),
  ]);

  return texto.toString('utf8');
}

export function hashSimples(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex');
}
