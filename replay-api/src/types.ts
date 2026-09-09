// Tipos compartilhados entre as camadas do projeto.

export interface Unit {
  id: number;
  nome: string;
  api_key_hash: string;
  import_api_key_hash: string | null;
  created_at: Date;
}

export interface Student {
  id: number;
  unit_id: number;
  nome: string;
  email_hash: string;
  email_encrypted: string;
  status: 'ativo' | 'inativo';
  created_at: Date;
}

export interface OtpCode {
  id: number;
  student_id: number;
  code_hash: string;
  expires_at: Date;
  tentativas: number;
  usado: boolean;
  created_at: Date;
}

export interface Replay {
  id: number;
  unit_id: number;
  student_id: number | null;
  quadra: string;
  b2_key_video: string;
  b2_key_thumb: string;
  duracao_seg: number | null;
  created_at: Date;
}

export interface JwtPayload {
  studentId: number;
  unitId: number;
}

// Extensão do Request do Express: adiciona os campos que os
// middlewares de autenticação preenchem (req.studentId, req.unitId),
// para eles terem checagem de tipo em qualquer rota.
declare global {
  namespace Express {
    interface Request {
      studentId?: number;
      unitId?: number;
    }
  }
}
