// Fingerprint of a recovered definition's execution contract (see src/main/payment/recovered-contract.json).
import { createHash } from 'node:crypto';

/** The fields that define a recovered function's behaviour. */
export interface RecoveredDefinition {
  kind?: unknown;
  language?: unknown;
  parameterCount?: unknown;
  length?: unknown;
  incoming?: unknown;
  registerCount?: unknown;
  registerCounts?: unknown;
  handlers?: unknown;
  constants?: unknown;
  code?: unknown;
  [field: string]: unknown;
}

// Include execution metadata as well as instructions: exception handlers, register ranges and argument layout can
// change observable behavior.
export function definitionFingerprint(definition: RecoveredDefinition): string {
  const fields = ['kind', 'language', 'parameterCount', 'length', 'incoming', 'registerCount', 'registerCounts', 'handlers', 'constants', 'code'] as const;
  const contract = Object.fromEntries(fields.map(field => [field, definition[field]]));
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}
