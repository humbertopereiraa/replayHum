import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.B2_BUCKET!;

export async function enviarArquivo(
  chave: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: chave,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return chave;
}

export async function gerarUrlDownload(
  chave: string,
  expiraEmSegundos = 300
): Promise<string> {
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: chave });
  return getSignedUrl(s3, comando, { expiresIn: expiraEmSegundos });
}
