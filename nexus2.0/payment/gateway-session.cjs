'use strict';

// Executed by page.evaluate in the existing browser session.
function readBrowserHints() {
  const data = navigator.userAgentData;
  const brands = data?.brands ?? [];
  return {
    ua:navigator.userAgent,
    secChUa:brands.map(brand => `"${brand.brand}";v="${brand.version}"`).join(', '),
    mobile:data?.mobile ? '?1' : '?0',
    platform:data?.platform ? `"${data.platform}"` : '"Windows"',
    lang:navigator.language || 'en-US',
  };
}

async function clientHints(actor) {
  if (actor.hints) return actor.hints;
  const hints = await actor.page.evaluate(readBrowserHints).catch(() => null);
  if (hints?.ua) actor.hints = hints;
  return hints ?? {ua:'',secChUa:'',mobile:'?0',platform:'"Windows"',lang:'en-US'};
}

async function gatewayHints(actor) {
  if (actor.desktopHints) return actor.desktopHints;
  const hints = await actor.clientHints();
  const uaVersion = Number(/Chrome\/(\d+)/.exec(hints.ua)?.[1] ?? 0);
  const brandVersion = Number(/"(?:Google Chrome|Chromium)";v="(\d+)"/.exec(hints.secChUa)?.[1] ?? 0);
  const version = String(Math.max(uaVersion,brandVersion) || 142);
  actor.desktopHints = {
    ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + version + '.0.0.0 Safari/537.36',
    platform:'"macOS"',mobile:'?0',
  };
  return actor.desktopHints;
}

function liveProviderOrigin(actor) {
  try {
    const origin = new URL(actor.page.url()).origin;
    if (/^https?:\/\//.test(origin)) return origin;
  } catch {}
  return actor.hosts.providerOrigin;
}

function setGatewayPageOrigin(actor, url) {
  try { if (url) actor.gatewayPageOrigin = new URL(url).origin; } catch {}
}

function gatewayPageReferrer(actor) {
  const origin = actor.gatewayPageOrigin;
  return origin ? {origin,referer:origin + '/'} : undefined;
}

function originFor(actor, host) {
  switch (host) {
    case 'wps': {
      const origin = actor.liveProviderOrigin();
      return {origin,referer:origin + '/',sameSite:true};
    }
    case 'qr': return {origin:actor.hosts.qrGateway,referer:actor.hosts.qrGateway + '/',sameSite:false};
    case 'paytm': return {origin:actor.hosts.paytm,referer:actor.hosts.paytm + '/',sameSite:false};
    case 'phonepe': {
      const origin = actor.hosts.phonepeMercury ?? '';
      return {origin,referer:origin + '/',sameSite:false};
    }
    case 'mercury': {
      const origin = actor.hosts.wps;
      return {origin,referer:origin + '/',sameSite:false};
    }
    case 'razorpay': {
      const origin = actor.hosts.razorpay ?? '';
      return {origin,referer:origin + '/',sameSite:true};
    }
  }
}

module.exports = {readBrowserHints,clientHints,gatewayHints,liveProviderOrigin,setGatewayPageOrigin,gatewayPageReferrer,originFor};
