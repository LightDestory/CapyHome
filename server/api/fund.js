import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import { text, date, amount } from '../utils/validation.js';

export function createFundRouter(db, queries, mutate, config) {
  const { FundTransaction } = db.models;
  const router = Router();
  router.get('/api/fund', async (req, res) => {
    const transactions = await queries.fund();
    const balanceCents = transactions.reduce((sum, row) => sum + (row.type === 'contribution' ? row.amountCents : -row.amountCents), 0);
    res.json({ balanceCents, transactions });
  });
  router.post('/api/fund', async (req, res) => {
    const { type } = req.body;
    if (!['contribution', 'expense'].includes(type)) throw new HttpError(400, 'validation.transactionType');
    const cents = amount(req.body.amount);
    const description = text(req.body.description, 'fields.description', 500);
    const day = date(req.body.date, config.timeZone);
    const balanceCents = await mutate(req, async t => {
      const current = await queries.balance(t);
      if (type === 'expense' && current < cents) throw new HttpError(409, 'fund.insufficient');
      if (type === 'contribution' && !Number.isSafeInteger(current + cents)) throw new HttpError(409, 'fund.limit');
      await FundTransaction.create({ userId: req.user.id, type, amountCents: cents, description, date: day }, { transaction: t });
      return current + (type === 'contribution' ? cents : -cents);
    });
    res.status(201).json({ message: req.t('fund.saved'), balanceCents });
  });
  return router;
}
