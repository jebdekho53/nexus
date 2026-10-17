// `module` exists only when the main process loads this file with require() (main/runtime/activity-log).
declare const module: { exports?: unknown } | undefined;
// Source: src/ts/renderer/matrix-payments.ts. Compiled into src/renderer/matrix-payments.js by `npm run build:renderer`; edit the TypeScript, not this file.
((root: Window) => {
  const labels: Readonly<Record<string, string>> = Object.freeze({ paytm: 'Paytm QR', phonepay: 'PhonePe QR', phonepe: 'PhonePe QR', razorpayqr: 'Razorpay QR', irctcqr: 'IRCTC QR', wallet: 'RailOne Wallet', webwallet: 'WebLogin Wallet', railoneqr: 'RailOne QR', railoneupi: 'RailOne UPI', paytmupi: 'Razorpay UPI' });
  const label = (method: unknown): string => labels[method as string] || String(method || 'Not selected');
  const normalize = (text: string): string => {
    const clean = String(text).trim().replace(/^[📲🚆🌐↗️\s]+/u, '').replace(/\s*—\s*(?:Ultra Fast|Super Fast|Fast|RailOne only|WebLogin only)$/i, '');
    const match = Object.values(labels).find(value => value.toLowerCase() === clean.toLowerCase());
    if (match) return match;
    if (/^PhonePay QR$/i.test(clean)) return 'PhonePe QR';
    return text;
  };
  const catalog: MatrixPaymentsCatalog = Object.freeze({ labels, label, normalize });
  if (typeof module === 'object' && module.exports) module.exports = catalog; else root.MATRIX_PAYMENTS = catalog;
})(globalThis as unknown as Window);
