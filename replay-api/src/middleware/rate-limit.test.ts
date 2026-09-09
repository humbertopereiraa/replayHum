import express from 'express';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';

describe('rate-limit', () => {
  it('deve responder 429 no formato da API', async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 1,
      skip: () => false,
      handler: (_req, res) => {
        res.status(429).json({ erro: 'muitas tentativas, tente em instantes' });
      },
    });

    const app = express();
    app.use(limiter);
    app.get('/x', (_req, res) => res.json({ ok: true }));

    await request(app).get('/x').expect(200);
    const blocked = await request(app).get('/x');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ erro: 'muitas tentativas, tente em instantes' });
  });
});
