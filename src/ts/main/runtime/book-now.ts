// "Book now" handling for General (GN) bookings. Default General uses standard Auto with GN's null clock target.
// An explicit developer-only candidate reuses Direct login and the existing API enquiry branch; it is not promoted on
// the basis of synthetic timing.

type Logger = (event: string, details?: Record<string, unknown>) => void;

interface FormLike {
  id?: string;
  journey?: { quota?: unknown } | null;
  quota?: unknown;
  manualLogin?: unknown;
  directLogin?: unknown;
  brahmosLogin?: unknown;
  [field: string]: unknown;
}

interface BookNowRequest {
  formId?: string;
  mode?: unknown;
  manual?: unknown;
  directLogin?: unknown;
  brahmosLogin?: unknown;
  form?: FormLike;
  matrixGeneralApiCandidate?: boolean;
  [field: string]: unknown;
}

export interface BookNow {
  observe(channel: string, args: unknown[], result: { ok?: unknown; data?: FormLike } | null | undefined): void;
  prepare(channel: string, args: unknown[]): unknown[];
}

export function createBookNow(log: Logger = () => undefined, { generalApiCandidate = false }: { generalApiCandidate?: boolean } = {}): BookNow {
  const forms = new Map<string, { quota: unknown }>(), candidateForms = new Set<unknown>();
  const automatic = (form: FormLike | undefined): boolean => form?.quota === 'GN' && !form.manualLogin && !form.directLogin && !form.brahmosLogin;
  return {
    observe(channel, args, result) {
      if (!result?.ok) return;
      const form = channel === 'app:get-form' ? result.data : channel === 'app:save-form' ? args[0] as FormLike : null;
      if (form?.id && form.journey) forms.set(form.id, { quota: form.journey.quota });
      if (channel === 'app:delete-form') { forms.delete(args[0] as string); candidateForms.delete(args[0]); }
    },
    prepare(channel, args) {
      const request = args[0] as BookNowRequest | null | undefined;
      if (!request || typeof request !== 'object') return args;
      if (channel === 'app:login') {
        candidateForms.delete(request.formId);
        if (request.mode === 'weblogin' && forms.get(request.formId as string)?.quota === 'GN' && !request.manual && !request.directLogin && !request.brahmosLogin) {
          if (generalApiCandidate) { candidateForms.add(request.formId); log('matrix-general-api-candidate', { page: 'Experimental General: reuse login session and existing API train-enquiry branch; speed unverified' }); return [{ ...request, directLogin: true }, ...args.slice(1)]; }
          log('matrix-auto-book-now', { page: 'Auto Book now: standard Auto browser-check flow; no opening-time countdown' });
        }
      }
      if (channel === 'app:start-booking' && generalApiCandidate && candidateForms.has(request.formId) && automatic(request.form)) return [{ ...request, matrixGeneralApiCandidate: true, form: { ...request.form, directLogin: true } }, ...args.slice(1)];
      if (channel === 'app:start-booking' && automatic(request.form)) log('matrix-auto-book-now-start', { page: 'General Auto: use standard Auto stages and provider waits now' });
      return args;
    },
  };
}
