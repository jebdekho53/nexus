(()=>{
 const init=()=>{
  const $=id=>document.getElementById(id),text=id=>$(id)?.textContent?.trim()||'—';
  const ticket=$('pnrContent'),qr=$('qrOverlay');if(!ticket||!qr)return;
  const icon=name=>name==='person'?'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="5" r="3"/><path d="M4 18v-3a6 6 0 0 1 12 0v3z"/></svg>':name==='seat'?'<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M8 15V7a4 4 0 0 1 8 0v8M5 12a3 3 0 0 0-3 3v4h20v-4a3 3 0 0 0-6 0H8a3 3 0 0 0-3-3zM12 19v6m-5 0h10"/></svg>':'';
  const compact=document.createElement('div');compact.className='receipt-details';
  compact.innerHTML=`<div class="receipt-passenger">${icon('person')} <span id="receiptPax">Passenger Details</span></div><div class="receipt-seat"><span class="receipt-symbol">${icon('seat')}</span><div><small>Coach &amp; Seat Allocation</small><strong id="receiptSeats">—</strong></div></div><div class="receipt-facts"><div><i>▣</i><small>Class</small><b id="receiptClass">—</b></div><div><i>▧</i><small>Quota</small><b id="receiptQuota">—</b></div></div><div class="receipt-speed"><span><svg viewBox="0 0 24 32" width="25" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M14 2 3 18h8l-1 12 11-18h-9z"/></svg></span><strong id="receiptDuration">—</strong><div>Booking Duration<small>Measured elapsed time</small></div></div>`;
  ticket.append(compact);
  const train=document.createElement('small');train.id='receiptTrain';document.querySelector('.bk-rmeta')?.append(train);
  const footer=document.createElement('div');footer.className='receipt-thanks';footer.textContent='Thank you for using MATRIX Railway Software';$('pnrFooter').append(footer);
  const polling=document.createElement('div');polling.className='qr-elapsed';polling.innerHTML='<strong id="paymentElapsed">00:00:00</strong><small>Payment wait time</small>';qr.append(polling);
  const formId=new URLSearchParams(location.search).get('id');
  window.api?.onBooked?.(event=>{
   if(event.formId&&event.formId!==formId)return;
   // The detailed ticket replaces this document in the same native window.
   // Suppress the legacy success summary while that navigation completes.
   document.documentElement.classList.add('matrix-success-pending');
  });
  const timingKey=formId?'matrix.booking.started.'+formId:null;
  let started=null,qrStarted=null,wasQr=false;
  document.addEventListener('click',e=>{if(e.target.closest('.act-weblogin,.act-start,.act-startnow')){
   started=Date.now();
   if(timingKey)try{localStorage.setItem(timingKey,String(started));}catch{}
  }});
  const time=ms=>{const s=Math.max(0,Math.floor(ms/1000));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')};
  const put=(id,value)=>{if($(id)&&$(id).textContent!==value)$(id).textContent=value};
  let finished=null,visibleBefore=false;
  const sync=()=>{
   const visible=!$('pnrOverlay').classList.contains('hidden'),rows=[...$('pnrPaxRows').children];
   put('receiptPax',`Passenger Details (${rows.length})`);
   const seats=rows.map(r=>r.lastElementChild?.textContent?.trim()).filter(Boolean);put('receiptSeats',seats.join(' · ')||'—');
   const cq=text('pnrClassQuota').split(/\s*[·|/]\s*/);put('receiptClass',cq[0]||'—');put('receiptQuota',cq[1]||'—');
   put('receiptTrain','Train : '+text('pnrTrain'));
   if(visible&&!visibleBefore){
    if(started===null&&timingKey)try{const saved=Number(localStorage.getItem(timingKey));if(saved>0&&Date.now()-saved<3600000)started=saved;}catch{}
    finished=started===null?null:Date.now()-started;
   }
   if(!visible)finished=null;
   visibleBefore=visible;
   put('receiptTime',finished===null?'—':time(finished));put('receiptDuration',finished===null?'—':(finished/1000).toFixed(2)+'s');
   const showing=!qr.classList.contains('hidden');if(showing&&!wasQr)qrStarted=performance.now();if(!showing)qrStarted=null;wasQr=showing;
   put('paymentElapsed',qrStarted===null?'00:00:00':time(performance.now()-qrStarted));
  };
  sync();setInterval(sync,250);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

