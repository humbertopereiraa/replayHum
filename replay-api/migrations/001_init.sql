-- Estrutura mínima do banco. Rode este arquivo uma vez no seu Postgres
-- (Supabase, Neon, ou qualquer provedor) para criar as tabelas.

CREATE TABLE units (
    id            SERIAL PRIMARY KEY,
    nome          VARCHAR(255) NOT NULL,
    api_key_hash  VARCHAR(255) NOT NULL, -- hash da API Key do servidor local desta unidade
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id               SERIAL PRIMARY KEY,
    unit_id          INTEGER NOT NULL REFERENCES units(id),
    nome             VARCHAR(255) NOT NULL,
    email_hash       VARCHAR(64) NOT NULL,   -- HMAC-SHA256 do e-mail, usado para BUSCA
    email_encrypted  TEXT NOT NULL,          -- e-mail cifrado (AES-256-GCM), usado para EXIBIÇÃO
    status           VARCHAR(20) NOT NULL DEFAULT 'ativo', -- ativo | inativo
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (unit_id, email_hash)
);

CREATE INDEX idx_students_email_hash ON students(email_hash);

CREATE TABLE otp_codes (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    code_hash   VARCHAR(64) NOT NULL,  -- hash do código de 6 dígitos, nunca em texto puro
    expires_at  TIMESTAMPTZ NOT NULL,
    tentativas  INTEGER NOT NULL DEFAULT 0,
    usado       BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE replays (
    id           SERIAL PRIMARY KEY,
    unit_id      INTEGER NOT NULL REFERENCES units(id),
    student_id   INTEGER REFERENCES students(id), -- pode ficar nulo até vincular ao aluno certo
    quadra       VARCHAR(100) NOT NULL,
    b2_key_video TEXT NOT NULL,   -- caminho do vídeo dentro do bucket B2
    b2_key_thumb TEXT NOT NULL,   -- caminho da thumbnail dentro do bucket B2
    duracao_seg  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replays_student ON replays(student_id);
CREATE INDEX idx_replays_unit_data ON replays(unit_id, created_at);
CREATE INDEX idx_replays_quadra ON replays(quadra);
