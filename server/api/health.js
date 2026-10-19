import { Router } from 'express';

export function createHealthRouter(db) {
  const router = Router();
  router.get('/api/health', async (req, res) => {
    await db.authenticate();
    res.json({ status: 'ok' });
  });
  return router;
}
