// GET /api/checkout-status?session_id=cs_... -> { paid, item, account } from Stripe.
import { enabled, stripe } from './_stripe.js';

export default async function handler(req, res) {
  if (!enabled()) return res.status(503).json({ error: 'Card payments are switched off.' });
  const id = String(req.query?.session_id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Unknown checkout.' });
  try {
    const s = await stripe(`checkout/sessions/${id}`);
    return res.status(200).json({ paid: s.payment_status === 'paid', item: s.metadata?.item, account: s.metadata?.account });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
