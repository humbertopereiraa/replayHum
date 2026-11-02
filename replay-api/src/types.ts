// Tipos compartilhados entre as camadas do projeto.

export interface Unit {
  id: number;
  nome: string;
  api_key_hash: string;
  import_api_key_hash: string | null;
  codigo_acesso_hash: string | null;
  qr_token_hash: string | null;
  created_at: Date;
}

export interface LoginRegistro {
  id: number;
  google_sub: string;
  nome: string;
  email_hash: string;
  email_encrypted: string;
  unit_id: number;
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
  sub: string;
  nome: string;
  unitId: number;
}

// Extensão do Request do Express: adiciona os campos que os
// middlewares de autenticação preenchem (req.googleSub, req.unitId),
// para eles terem checagem de tipo em qualquer rota.
declare global {
  namespace Express {
    interface Request {
      googleSub?: string;
      usuarioNome?: string;
      unitId?: number;
    }
  }
}
