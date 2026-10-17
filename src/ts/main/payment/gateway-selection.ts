// Which payment methods to try, in order, and which bank to use for a method.

const DIRECT_METHODS = ['phonepay', 'paytm', 'irctcqr', 'razorpayqr', 'paytmupi'];

export function paymentCandidates<Table>(
  selected: string | undefined,
  table: Table,
  { getOrder, isAvailable }: { getOrder: () => readonly string[]; isAvailable: (table: Table, method: string) => boolean },
): Array<string | undefined> {
  if (selected && !DIRECT_METHODS.includes(selected)) return [selected];
  const candidates: Array<string | undefined> = [];
  if (selected && isAvailable(table, selected)) candidates.push(selected);
  for (const method of getOrder()) {
    if (method !== selected && isAvailable(table, method) && !candidates.includes(method)) candidates.push(method);
  }
  if (candidates.length === 0) candidates.push(selected || getOrder()[0]);
  return candidates;
}

export function choosePaymentBank<Table, Id>(
  table: Table,
  method: string,
  { getIds, defaultBankId, hasBank }: { getIds: () => Record<string, readonly Id[] | undefined>; defaultBankId: (method: string) => Id; hasBank: (table: Table, id: Id) => boolean },
): Id | undefined {
  const ids = getIds()[method] ?? [defaultBankId(method)];
  return ids.find(id => hasBank(table, id)) ?? ids[0];
}
