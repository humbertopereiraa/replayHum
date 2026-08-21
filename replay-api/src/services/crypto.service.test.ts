import { decryptEmail, encryptEmail, hashEmail, hashSimples } from './crypto.service';

describe('crypto.service', () => {
  describe('hashEmail', () => {
    it('deve normalizar email com trim e lowercase', () => {
      const hashNormalizado = hashEmail('  Usuario@Test.COM  ');
      const hashEsperado = hashEmail('usuario@test.com');

      expect(hashNormalizado).toBe(hashEsperado);
    });

    it('deve retornar o mesmo hash para o mesmo email', () => {
      const email = 'aluno@academia.com';

      expect(hashEmail(email)).toBe(hashEmail(email));
    });

    it('deve retornar hashes diferentes para emails diferentes', () => {
      expect(hashEmail('a@test.com')).not.toBe(hashEmail('b@test.com'));
    });
  });

  describe('encryptEmail e decryptEmail', () => {
    it('deve fazer round-trip do email cifrado', () => {
      const email = 'aluno@academia.com';
      const cifrado = encryptEmail(email);

      expect(decryptEmail(cifrado)).toBe(email);
    });

    it('deve gerar formato iv:tag:dados com 3 partes hex', () => {
      const partes = encryptEmail('teste@email.com').split(':');

      expect(partes).toHaveLength(3);
      partes.forEach((parte) => {
        expect(parte).toMatch(/^[0-9a-f]+$/);
      });
    });

    it('deve falhar ao descriptografar com tag adulterada', () => {
      const cifrado = encryptEmail('teste@email.com');
      const [iv, , dados] = cifrado.split(':');
      const tagAdulterada = '0'.repeat(32);

      expect(() => decryptEmail(`${iv}:${tagAdulterada}:${dados}`)).toThrow();
    });
  });

  describe('hashSimples', () => {
    it('deve ser determinístico', () => {
      expect(hashSimples('valor')).toBe(hashSimples('valor'));
    });

    it('deve retornar hash hex de 64 caracteres', () => {
      const hash = hashSimples('valor');

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
