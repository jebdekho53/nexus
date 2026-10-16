'use strict';

async function gatewayHeaders(actor, host, options={}) {
  const hints = await actor.clientHints();
  const {origin,referer,sameSite} = actor.originFor(host);
  const headers = {
    Referer:options.referer ?? referer,
    'Accept-Language':hints.lang + ',en;q=0.9',
    'sec-fetch-site':options.secFetchSite ?? (sameSite ? 'same-site' : 'cross-site'),
    'sec-fetch-mode':options.navigate ? 'navigate' : 'cors',
    'sec-fetch-dest':options.navigate ? 'document' : 'empty',
  };
  if (options.navigate) {
    headers['Upgrade-Insecure-Requests'] = '1';
    if (options.htmlAccept !== false) headers.Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    headers['sec-gpc'] = '1';
    headers.Dnt = '1';
  }
  if (!options.omitOrigin) headers.Origin = options.origin ?? origin;
  const gateway = host === 'wps' ? null : await actor.gatewayHints();
  const ua = options.ua || gateway?.ua || hints.ua;
  if (ua) headers['User-Agent'] = ua;
  if (hints.secChUa && !options.noHints) {
    headers['sec-ch-ua'] = hints.secChUa;
    headers['sec-ch-ua-mobile'] = gateway?.mobile ?? hints.mobile;
    headers['sec-ch-ua-platform'] = gateway?.platform ?? hints.platform;
  }
  return {...headers, ...(options.extra ?? {})};
}

module.exports = {gatewayHeaders};
