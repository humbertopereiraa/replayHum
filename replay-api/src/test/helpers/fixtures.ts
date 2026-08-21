import type { OtpCode, Replay, Student } from '../../types';

export function createOtpCode(overrides: Partial<OtpCode> = {}): OtpCode {
  return {
    id: 1,
    student_id: 10,
    code_hash: 'hash-teste',
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    tentativas: 0,
    usado: false,
    created_at: new Date(),
    ...overrides,
  };
}

export function createStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 10,
    unit_id: 1,
    nome: 'Aluno Teste',
    email_hash: 'email-hash-teste',
    email_encrypted: 'email-cifrado-teste',
    status: 'ativo',
    created_at: new Date(),
    ...overrides,
  };
}

export function createReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    id: 1,
    unit_id: 1,
    student_id: null,
    quadra: 'Quadra 1',
    b2_key_video: '1/Quadra 1/123.mp4',
    b2_key_thumb: '1/Quadra 1/123.jpg',
    duracao_seg: 120,
    created_at: new Date(),
    ...overrides,
  };
}

export function createMulterFile(
  overrides: Partial<Express.Multer.File> = {}
): Express.Multer.File {
  return {
    fieldname: 'video',
    originalname: 'video.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: 1024,
    buffer: Buffer.from('conteudo-teste'),
    stream: null as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}
