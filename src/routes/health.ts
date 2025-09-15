import type express from 'express';

export function registerHealth(app: express.Express) {
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
}

