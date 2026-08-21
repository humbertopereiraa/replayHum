import pool from '../config/db';

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;

let started = false;

async function ping(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log('[keepalive] SELECT 1 ok:', new Date().toISOString());
  } catch (err) {
    console.error('[keepalive] falha ao pingar o banco:', err);
  }
}

export function startSupabaseKeepalive(): void {
  if (started) return;
  started = true;

  void ping();
  setInterval(() => {
    void ping();
  }, FIVE_DAYS);
}
