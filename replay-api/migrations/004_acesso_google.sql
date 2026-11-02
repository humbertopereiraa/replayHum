-- Acesso da quadra (código digitado e token do QR) e registro de cada login.
-- Não há conta de usuário: logins só guarda que a entrada aconteceu.

ALTER TABLE units
    ADD COLUMN IF NOT EXISTS codigo_acesso_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS qr_token_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS units_codigo_acesso_hash_key
    ON units (codigo_acesso_hash)
    WHERE codigo_acesso_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS units_qr_token_hash_key
    ON units (qr_token_hash)
    WHERE qr_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS logins (
    id               SERIAL PRIMARY KEY,
    google_sub       VARCHAR(255) NOT NULL,
    nome             VARCHAR(255) NOT NULL,
    email_hash       VARCHAR(64) NOT NULL,
    email_encrypted  TEXT NOT NULL,
    unit_id          INTEGER NOT NULL REFERENCES units(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logins_unit_data ON logins(unit_id, created_at);
