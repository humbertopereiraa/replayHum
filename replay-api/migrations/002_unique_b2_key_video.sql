-- Impede replays duplicados para o mesmo objeto no B2 e torna
-- POST /upload/confirm idempotente (retry do Mini PC não cria linha nova).
CREATE UNIQUE INDEX idx_replays_b2_key_video ON replays(b2_key_video);
