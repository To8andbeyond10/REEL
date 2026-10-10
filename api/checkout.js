// POST /api/checkout { item, account } -> { url } of a Stripe Checkout page for one store item.
// The price is looked up here, so a player can't change what they pay.
import { itemById } from '../src/sim/store.js';
import { ACCOUNT_ID, enabled, stripe } from './_stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!enabled()) return res.status(503).json({ error: 'Card payments are switched off.' });
  const { item: itemId, account } = req.body || {};
  const item = itemById(itemId);
  if (!item || !(item.usd > 0)) return res.status(400).json({ error: 'Unknown item.' });
  if (!ACCOUNT_ID.test(String(account))) return res.status(400).json({ error: 'Unknown account.' });
  const origin = process.env.PUBLIC_URL || `https://${req.headers.host}`;
  try {
    const session = await stripe('checkout/sessions', {
      method: 'POST',
      form: {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(Math.round(item.usd * 100)),
        'line_items[0][price_data][product_data][name]': `Memefishing: ${item.name}`,
        'line_items[0][price_data][product_data][description]': 'Cosmetic look for your float or rod. Looks only.',
        client_reference_id: account,
        'metadata[item]': item.id,
        'metadata[account]': account,
        success_url: `${origin}/?checkout={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancel`
      }
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
