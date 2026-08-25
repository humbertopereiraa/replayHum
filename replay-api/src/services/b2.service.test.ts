jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});

  return {
    S3Client: jest.fn().mockImplementation(() => ({ send })),
    PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.test/arquivo'),
}));

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { enviarArquivo, gerarUrlDownload } from './b2.service';

const MockS3Client = jest.mocked(S3Client);
const mockGetSignedUrl = jest.mocked(getSignedUrl);

const mockSend = (MockS3Client.mock.results[0]?.value as { send: jest.Mock }).send;

describe('b2.service', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockGetSignedUrl.mockClear();
    mockSend.mockResolvedValue({});
    mockGetSignedUrl.mockResolvedValue('https://signed-url.test/arquivo');
  });

  describe('enviarArquivo', () => {
    it('deve enviar arquivo ao S3 e retornar a chave', async () => {
      const buffer = Buffer.from('video-teste');
      const chave = '1/quadra/123.mp4';

      const resultado = await enviarArquivo(chave, buffer, 'video/mp4');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: chave,
        Body: buffer,
        ContentType: 'video/mp4',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(resultado).toBe(chave);
    });
  });

  describe('gerarUrlDownload', () => {
    it('deve gerar URL com expiração padrão de 300 segundos', async () => {
      const chave = '1/quadra/123.mp4';

      const url = await gerarUrlDownload(chave);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: chave,
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ input: { Bucket: 'bucket-test', Key: chave } }),
        { expiresIn: 300 }
      );
      expect(url).toBe('https://signed-url.test/arquivo');
    });

    it('deve respeitar expiração customizada', async () => {
      await gerarUrlDownload('chave.jpg', 600);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        { expiresIn: 600 }
      );
    });

    it('deve incluir Content-Disposition quando o nome do arquivo é informado', async () => {
      const chave = '1/quadra/123.mp4';

      await gerarUrlDownload(chave, 300, 'replay-123.mp4');

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: chave,
        ResponseContentDisposition: 'attachment; filename="replay-123.mp4"',
      });
    });
  });
});
