// The spelling ("insurence") and the empty insured value are the provider's existing wire contract.
// Preserve plain concatenation; do not re-encode identifiers.
export function bookingPaymentUrl(apiBase: string, transactionId: string | number, insuranceApplicable: unknown): string {
  return apiBase + '/bookingInitPayment/' + transactionId + '?insurenceApplicable=' + (insuranceApplicable ? '' : 'NA');
}

export function bookingDataUrl(apiBase: string, transactionId: string | number): string {
  return apiBase + '/bookingData/' + transactionId;
}
