-- Chave de importação de alunos, separada da API Key do servidor local (upload).
-- Sem este hash preenchido, POST /students/import responde 401.

ALTER TABLE units
    ADD COLUMN IF NOT EXISTS import_api_key_hash VARCHAR(255);
