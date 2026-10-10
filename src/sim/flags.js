// Feature switches. Real-money payments are off unless the deployment turns them on with
// VITE_REAL_MONEY_PAYMENTS=true (and a STRIPE_SECRET_KEY for the server side, see docs/BETA.md).
export const FLAGS = Object.freeze({
  realMoneyPayments: import.meta.env?.VITE_REAL_MONEY_PAYMENTS === 'true'
});
