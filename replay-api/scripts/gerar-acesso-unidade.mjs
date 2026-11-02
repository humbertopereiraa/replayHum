import crypto from 'crypto';
import 'dotenv/config';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigoCurto() {
  let codigo = '';
  while (codigo.length < 8) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= ALFABETO.length * Math.floor(256 / ALFABETO.length)) continue;
    codigo += ALFABETO[byte % ALFABETO.length];
  }
  return codigo;
}

function hashAcesso(valor) {
  const chave = process.env.EMAIL_HASH_KEY;
  if (!chave) {
    console.error('Defina EMAIL_HASH_KEY (rode este script na pasta replay-api, com o .env carregado).');
    process.exit(1);
  }
  return crypto.createHmac('sha256', chave).update(valor).digest('hex');
}

const unitId = process.argv[2];
const filtro = unitId && /^\d+$/.test(unitId) ? `WHERE id = ${unitId}` : 'WHERE id = <ID_DA_UNIDADE>';
const codigo = codigoCurto();
const qrToken = crypto.randomBytes(32).toString('hex');
const front = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

console.log(`Código da quadra: ${codigo}`);
console.log(`URL do QR: ${front}/q/${qrToken}`);
console.log(`
UPDATE units
SET codigo_acesso_hash = '${hashAcesso(codigo)}',
    qr_token_hash = '${hashAcesso(qrToken)}'
${filtro};
`);
console.log('Guarde o código e a URL agora. Eles não ficam salvos em texto puro.');
