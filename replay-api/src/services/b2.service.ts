import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.B2_BUCKET!;

export type MetadadosObjeto = {
  tamanho: number;
  contentType?: string;
};

export async function gerarUrlUpload(
  chave: string,
  contentType: string,
  expiraEmSegundos = 900,
  contentLength?: number
): Promise<string> {
  const comando = new PutObjectCommand({
    Bucket: BUCKET,
    Key: chave,
    ContentType: contentType,
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(s3, comando, { expiresIn: expiraEmSegundos });
}

export async function obterMetadadosObjeto(chave: string): Promise<MetadadosObjeto | null> {
  try {
    const resultado = await s3.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: chave,
      })
    );
    return {
      tamanho: resultado.ContentLength ?? 0,
      contentType: resultado.ContentType,
    };
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

export async function gerarUrlDownload(
  chave: string,
  expiraEmSegundos = 300,
  nomeArquivo?: string
): Promise<string> {
  const comando = new GetObjectCommand({
    Bucket: BUCKET,
    Key: chave,
    ...(nomeArquivo
      ? { ResponseContentDisposition: `attachment; filename="${nomeArquivo}"` }
      : {}),
  });
  return getSignedUrl(s3, comando, { expiresIn: expiraEmSegundos });
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
