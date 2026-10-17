'use strict';

async function fetchProviderEncdata(actor, qr, {parseConfig}) {
  const response=await actor.req.post(qr.pgOrigin+'/pg/api/statusCheckRedirect', {
    headers:await actor.gwHeaders('qr', {navigate:true,origin:qr.pgOrigin,referer:qr.authReferer||qr.pgOrigin,secFetchSite:'same-origin'}),
    form:{merchantId:qr.merchantId,merchantTxnNo:qr.merchantTxnNo,aggregatorID:''},
  }).catch(()=>null);
  if (!response) return '';
  const params=(parseConfig(await response.text().catch(()=>''))??{}).responseParams??{};
  return String(params.encdata??params.encData??params.ENC_DATA??params.enc_data??'');
}

async function pollProviderQr(actor, qr, stopped, onWait, maxAttempts=72, interval=10000, sleep, {parseConfig,classify,clock=Date}) {
  if (!qr.pgOrigin||!qr.merchantId||!qr.merchantTxnNo) {
    actor.log('pollProviderQr: missing PG ids — cannot poll the payment status','error');
    return {kind:'failed',reason:'IRCTC QR gateway did not return the payment ids'};
  }
  const url=qr.pgOrigin+'/pg/api/command?reqFormat=JSON';
  const data=JSON.stringify({merchantId:qr.merchantId,merchantTxnNo:qr.merchantTxnNo,originalTxnNo:qr.merchantTxnNo,reqFormat:'JSON',transactionType:'STATUS',aggregatorID:null,isIntent:''});
  const headers=await actor.gwHeaders('qr', {
    origin:qr.pgOrigin,referer:qr.authReferer||qr.pgOrigin,secFetchSite:'same-origin',
    extra:{'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',Accept:'*/*',...(qr.pageToken?{Iscallfrompaymentoptionspage:qr.pageToken}:{})},
  });
  actor.log('pollProviderQr: command poll every '+Math.round(interval/1000)+'s (token='+(qr.pageToken?'y':'N')+')');
  let errors=0,fallback=false,lastLog='',fastPolls=0;
  for (let attempt=0;attempt<maxAttempts;attempt++) {
    if (stopped()) return {kind:'stopped'};
    if (!fallback) {
      const response=await actor.req.post(url,{headers,data}).catch(()=>null);
      if (!response) {
        if (++errors>=5) {
          fallback=true;
          actor.log('pollProviderQr: command network errors ×5 — falling back to statusCheckRedirect','warn');
        }
      } else {
        const text=await response.text().catch(()=>'');
        let body={};
        try { body=JSON.parse(text); } catch {}
        const status=classify(body);
        const line=('command → '+response.status()+' ['+status+'] '+String(body.txnStatus??'')+'/'+String(body.responseCode??'')+'/'+String(body.respDescription??'')).replace(/\s+$/,'');
        if (line!==lastLog) { actor.log('pollProviderQr '+line);lastLog=line; }
        if (status==='paid') {
          const encdata=await actor.irctcQrFetchEncdata(qr);
          actor.log('providerQr paid (command SUC) — encdata='+(encdata?'y':'NONE'));
          return {kind:'paid',encdata};
        }
        if (status==='declined') return {kind:'declined',reason:'Payment '+String(body.respDescription??'declined')};
        if (response.ok()&&(body.txnStatus||body.responseCode||body.respDescription)) errors=0;
        else if (++errors>=5) {
          fallback=true;
          actor.log('pollProviderQr: command unusable ×5 (last HTTP '+response.status()+') — falling back to statusCheckRedirect','warn');
        } else actor.log('pollProviderQr: command not usable (HTTP '+response.status()+') — retry '+errors+'/5','warn');
      }
    }
    if (fallback) {
      const response=await actor.req.post(qr.pgOrigin+'/pg/api/statusCheckRedirect', {
        headers:await actor.gwHeaders('qr',{navigate:true,origin:qr.pgOrigin,referer:qr.authReferer||qr.pgOrigin,secFetchSite:'same-origin'}),
        form:{merchantId:qr.merchantId,merchantTxnNo:qr.merchantTxnNo,aggregatorID:''},
      }).catch(()=>null);
      if (response) {
        const body=parseConfig(await response.text().catch(()=>''))??{};
        const status=String(body.status??'').toUpperCase();
        if (status) actor.log('pollProviderQr statusCheckRedirect → '+response.status()+' status="'+status+'"');
        if (status==='SUC'||status==='SUCCESS') {
          const params=body.responseParams??{};
          const encdata=String(params.encdata??params.encData??params.ENC_DATA??params.enc_data??'');
          actor.log('providerQr paid (statusCheckRedirect) — encdata='+(encdata?'y':'NONE'));
          return {kind:'paid',encdata};
        }
        if (/FAIL|DECLIN|CANCEL|REJECT|ABORT|EXPIR/.test(status)) return {kind:'declined',reason:'Payment '+(status.toLowerCase()||'cancelled')};
      }
    }
    onWait?.();
    const before=clock.now();
    await (sleep?sleep(interval):actor.sleep(interval));
    if (clock.now()-before<interval*0.6&&fastPolls<60) { fastPolls++;attempt--; }
  }
  return {kind:'timeout'};
}

module.exports={fetchProviderEncdata,pollProviderQr};
