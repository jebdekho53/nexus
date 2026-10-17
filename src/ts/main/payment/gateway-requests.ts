// Authenticated GET requests to the gateway for the final booking data and the printable ticket.

export interface GatewayRequestInput {
  accessToken?: string | null;
  greq: unknown;
  bmiyek: unknown;
  spaCsrf: unknown;
  clientTxnId?: string;
  pnr?: string;
  lang?: string;
  stopRetry?: () => boolean;
}

export interface GatewayResponse {
  json(): Promise<unknown>;
  status(): number;
}

export interface GatewayRequestActor {
  hosts: { wps: string };
  req: { get(url: string, options: { headers: unknown }): Promise<GatewayResponse> };
  reqRetry<T>(label: string, operation: () => Promise<T>, maxAttempts?: number, stopRetry?: () => boolean): Promise<T>;
  gwHeaders(host: string, options: { omitOrigin: boolean; extra: Record<string, unknown> }): Promise<unknown>;
  log(message: string): void;
}

export async function requestBookingData(actor: GatewayRequestActor, input: GatewayRequestInput): Promise<unknown> {
  const response = await actor.reqRetry('bookingData', async () => actor.req.get(
    actor.hosts.wps + '/eticketing/protected/mapps1/bookingData/' + input.clientTxnId,
    {
      headers: await actor.gwHeaders('wps', {
        omitOrigin: true,
        extra: {
          Authorization: input.accessToken ? 'Bearer ' + input.accessToken : '',
          greq: input.greq,
          bmiyek: input.bmiyek,
          'Spa-Csrf-Token': input.spaCsrf,
        },
      }),
    },
  ), 4, input.stopRetry);
  return response.json().catch(() => ({}));
}

export async function requestPrintTicket(actor: GatewayRequestActor, input: GatewayRequestInput): Promise<unknown> {
  const response = await actor.reqRetry('printTicket', async () => actor.req.get(
    actor.hosts.wps + '/eticketing/protected/mapps1/printTicket/' + input.pnr + '/' + (input.lang || 'en'),
    {
      headers: await actor.gwHeaders('wps', {
        omitOrigin: true,
        extra: {
          Authorization: input.accessToken ? 'Bearer ' + input.accessToken : '',
          greq: input.greq,
          bmiyek: input.bmiyek,
          'Spa-Csrf-Token': input.spaCsrf,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }),
    },
  ));
  const detail = await response.json().catch(() => null);
  actor.log('printTicket/' + input.pnr + ' → ' + response.status());
  return detail;
}
