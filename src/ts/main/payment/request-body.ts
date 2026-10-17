// Request body for the booking payment-initiation call.

export type PaymentMethod = string;

export interface BookingPaymentBody {
  bankId: unknown;
  txnType: 7 | 1;
  paramList: Array<{ key: string; value: string }>;
  amount: string;
  transationId: 0;
  txnStatus: 1;
}

/** Wallet payments carry an empty transaction password parameter; everything else sends an empty parameter list. */
export function bookingPaymentBody(
  method: PaymentMethod,
  amount: unknown,
  bankOverride: unknown,
  defaultBankId: (method: PaymentMethod) => unknown,
): BookingPaymentBody {
  const bankId = bankOverride ?? defaultBankId(method);
  if (method === 'wallet') return {
    bankId, txnType: 7, paramList: [{ key: 'TXN_PASSWORD', value: '' }],
    amount: String(amount), transationId: 0, txnStatus: 1,
  };
  return { bankId, txnType: 1, paramList: [], amount: String(amount), transationId: 0, txnStatus: 1 };
}
