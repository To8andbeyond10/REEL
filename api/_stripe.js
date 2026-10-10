// Shared helpers for the card-payment functions (Vercel serverless, Node).
// Card details go to Stripe's hosted checkout page and never pass through these functions.
export const enabled = () => process.env.VITE_REAL_MONEY_PAYMENTS === 'true' && !!process.env.STRIPE_SECRET_KEY;

export async function stripe(path, { method = 'GET', form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    },
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export const ACCOUNT_ID = /^acct_[a-z0-9]{12}$/;
