jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});

  return {
    S3Client: jest.fn().mockImplementation(() => ({ send })),
    PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    HeadObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.test/arquivo'),
}));

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { gerarUrlDownload, gerarUrlUpload, obterMetadadosObjeto } from './b2.service';

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

  describe('gerarUrlUpload', () => {
    it('deve gerar URL de PUT com content-type e expiração padrão de 900 segundos', async () => {
      const chave = '1/quadra/123.mp4';

      const url = await gerarUrlUpload(chave, 'video/mp4');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: chave,
        ContentType: 'video/mp4',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          input: { Bucket: 'bucket-test', Key: chave, ContentType: 'video/mp4' },
        }),
        { expiresIn: 900 }
      );
      expect(url).toBe('https://signed-url.test/arquivo');
    });

    it('deve incluir ContentLength quando o tamanho é informado', async () => {
      await gerarUrlUpload('1/quadra/123.mp4', 'video/mp4', 900, 12345);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: '1/quadra/123.mp4',
        ContentType: 'video/mp4',
        ContentLength: 12345,
      });
    });

    it('deve respeitar expiração customizada', async () => {
      await gerarUrlUpload('1/quadra/123.jpg', 'image/jpeg', 600);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          input: expect.objectContaining({ ContentType: 'image/jpeg' }),
        }),
        { expiresIn: 600 }
      );
    });
  });

  describe('obterMetadadosObjeto', () => {
    it('deve retornar tamanho e content-type do objeto', async () => {
      mockSend.mockResolvedValue({
        ContentLength: 12345,
        ContentType: 'video/mp4',
      });

      const metadados = await obterMetadadosObjeto('1/quadra/123.mp4');

      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket-test',
        Key: '1/quadra/123.mp4',
      });
      expect(metadados).toEqual({ tamanho: 12345, contentType: 'video/mp4' });
    });

    it('deve retornar null quando o objeto não existe', async () => {
      mockSend.mockRejectedValue({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });

      const metadados = await obterMetadadosObjeto('1/quadra/ausente.mp4');

      expect(metadados).toBeNull();
    });

    it('deve relançar erros que não são 404', async () => {
      mockSend.mockRejectedValue(new Error('falha de rede'));

      await expect(obterMetadadosObjeto('1/quadra/123.mp4')).rejects.toThrow('falha de rede');
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
