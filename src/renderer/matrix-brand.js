'use strict';
(() => {
  const brand=text=>text.replace(/Xhamster\s*TS/gi,'Matrix').replace(/Tatkal Software/gi,'Matrix').replace(/\bBrahmos\s+Browser\b/gi,'Matrix Browser').replace(/\bBrahmos\b/gi,'Matrix').replace(/\b(Updating|Quit|Restart|use) TS\b/g,'$1 Matrix');
  const wording=[["Saved login","IRCTC Account"],["Check ID","Verify ID"],["New Booking Form","Create Booking"],["Journey Planning","Journey Details"],["Booking Options","Booking Preferences"],["Booking rules","Booking Preferences"],["Payment Information","Payment Details"],["Passenger Information","Passenger Details"],["Create a Pair","Add Booking Account"],["If another pair books first","When another account books successfully"],["Stop this run","Stop this booking"],["Book a backup","Continue this booking"],["Proxy for this pair","Proxy for this account"],["Paste proxies","Import Proxy List"],["Got it","Understood"]];
  wording.push(["Create Pair","Add Account"],["Same as this form","Use this form’s proxy"]);
  wording.push(["Saving e-ticket to Desktop…","Saving e-ticket to Matrix Tickets…"],["E-ticket saved to Desktop","E-ticket saved to Downloads / Matrix Tickets"]);
  const friendly=text=>wording.reduce((value,[from,to])=>value.split(from).join(to),text);
  const page=location.pathname.split('/').pop().replace('.html','');
  if(['open-form','login-data','payment','history'].includes(page))wording.push(['New Payment Method','Add UPI ID'],['Edit Payment Method','Edit UPI ID'],['Add User ID','Add IRCTC Account'],['Edit User ID','Edit IRCTC Account'],['Open Form','Open Booking'],['Duplicate','Make a Copy']);
  const version=globalThis.MATRIX_BUILD?.version;
  const logo='./assets/matrix-mark.png';
  let favicon=document.querySelector('link[rel="icon"]');if(!favicon){favicon=document.createElement('link');favicon.rel='icon';document.head.append(favicon);}favicon.href=logo;
  document.body.classList.add('matrix-'+page);
  const cleanNode=node=>{
    if(node.nodeType===Node.TEXT_NODE&&!node.parentElement?.closest('script,style,textarea,input,[contenteditable]')) {
      let next=friendly(brand(node.nodeValue));
      if(page==='open-form'&&node.parentElement?.closest('button')){const labels={'Open':'Open Booking','Edit':'Edit Setup','Clone':'Make a Copy','Delete':'Remove Setup'};const label=next.trim();if(labels[label])next=next.replace(label,labels[label]);}
      if(globalThis.MATRIX_PAYMENTS)next=globalThis.MATRIX_PAYMENTS.normalize(next);
      if(version&&node.parentElement?.matches('#appVer,.ver,.bigver'))next='v'+version;
      if(next!==node.nodeValue)node.nodeValue=next;
     } else if(node.nodeType===Node.ELEMENT_NODE) {
      if(node.matches('option')&&node.value===''&&['savedUser','pairUser'].includes(node.parentElement?.id)&&node.textContent!=='Choose an IRCTC ID')node.textContent='Choose an IRCTC ID';
      for(const attribute of ['title','aria-label','alt','placeholder'])if(node.hasAttribute(attribute)){
        const value=node.getAttribute(attribute),next=friendly(brand(value));if(value!==next)node.setAttribute(attribute,next);
      }
      for(const child of [...node.childNodes])cleanNode(child);
    }
  };
  cleanNode(document.body);
  const title=()=>{
    if(page==='booking-box'){if(document.title!=='Booking')document.title='Booking';return;}
    const next=brand(document.title);const full=next.startsWith('Matrix')?next:'Matrix · '+next;if(document.title!==full)document.title=full;
  };
  title();new MutationObserver(title).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});
  const observer=new MutationObserver(records=>{
    for(const record of records){if(record.type==='characterData'||record.type==='attributes')cleanNode(record.target);for(const node of record.addedNodes)cleanNode(node);}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','alt','placeholder']});
  for(const dot of document.querySelectorAll('.topbar .brand > .dot, .verlogo')){dot.remove();}
  for(const element of document.querySelectorAll('.center, .m-logo, .splash .logo')) {
    const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-mark';element.replaceChildren(image);
  }
  for(const headerLogo of document.querySelectorAll('.matrix-header-logo')) {
    headerLogo.src=logo;
  }
  for(const header of document.querySelectorAll('.topbar .brand')){
    if(!header.querySelector('.matrix-header-logo')){
      const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-header-logo';header.prepend(image);
    }
  }
  for(const brandBox of document.querySelectorAll('.workspace-brand')){
    const image=document.createElement('img');image.src=logo;image.alt='Matrix';brandBox.replaceChildren(image);
  }
  if(page==='app-lock'){const box=document.querySelector('.al-lock');if(box){const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-mark';box.replaceChildren(image);}}
  const vendor=document.getElementById('tgHandle')?.closest('section');if(vendor)vendor.classList.add('matrix-vendor-channel');
  const failBrand=document.getElementById('failBrand');if(failBrand){const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-header-logo';failBrand.replaceChildren(image);}
  if(page==='splash'){
    const heading=document.querySelector('.title');if(heading)heading.textContent=version?'v'+version:'';
    const tagline=document.querySelector('.tagline');if(tagline)tagline.textContent='';
    const status=document.querySelector('.status');if(status)status.textContent='Preparing your workspace…';
  }
  if(page==='form'||page==='booking-box'){
    const select=document.getElementById(page==='form'?'paymentMethod':'paySel');
    if(select){
      const summary=document.createElement('div');summary.className='matrix-payment-summary';if(page==='form')select.parentElement.append(summary);
      let previous;
      const sync=()=>{
        for(const option of select.options){const label=globalThis.MATRIX_PAYMENTS?.labels[option.value];if(label&&option.textContent!==label)option.textContent=label;}
        if(select.value!==previous){previous=select.value;summary.textContent='Selected: '+(globalThis.MATRIX_PAYMENTS?.label(previous)||previous||'Not selected');}
        if(page==='booking-box'){
          const label=document.querySelector('#payPick .bb-pick-label'),payment=globalThis.MATRIX_PAYMENTS?.label(select.value)||select.selectedOptions[0]?.textContent;
          if(label&&payment&&label.textContent!==payment)label.textContent=payment;
        }
      };
      sync();select.addEventListener('change',sync);setInterval(sync,500);
    }
  }
  if(page==='booking-box'){
    // Masking function for passenger names
    const maskName = str => {
      if (!str || typeof str !== 'string') return str;
      if (str.includes('*') || str.includes('•')) return str;
      return str.trim().split(/\s+/).map(word => {
        if (word.length <= 1) return word;
        if (word.length === 2) return word[0] + '*';
        return word[0] + '*'.repeat(Math.max(2, Math.min(word.length - 1, 4)));
      }).join(' ');
    };

    // Mask passenger names in Pair windows and Success card
    const maskAllPassengerNames = () => {
      // 1. Success card passenger rows
      const paxRows = document.getElementById('pnrPaxRows');
      if (paxRows) {
        const rows = paxRows.querySelectorAll('.bk-trow, tr, div');
        for (const r of rows) {
          const cols = r.children;
          if (cols && cols.length >= 2) {
            const nameCol = cols[1];
            if (nameCol && nameCol.textContent && !nameCol.textContent.includes('*')) {
              nameCol.textContent = maskName(nameCol.textContent);
            }
          }
        }
      }
      // 2. Check if this is a Pair window
      const isPair = (new URLSearchParams(location.search).get('view') !== 'ticket') || !!document.getElementById('pairNum')?.textContent?.trim();
      if (isPair) {
        for (const el of document.querySelectorAll('.pax-name, .cred-v, .bk-masked, td:nth-child(2)')) {
          if (el.textContent && !el.textContent.includes('*')) {
            el.textContent = maskName(el.textContent);
          }
        }
      }
    };

    const formatPnr=()=>{
      const pnrEl=document.getElementById('pnrNum');
      if(!pnrEl)return;
      const text=(pnrEl.textContent||'').trim();
      if(!text||pnrEl.querySelector('.pnr-last-three'))return;
      const digits=text.replace(/[^0-9]/g,'');
      if(digits.length>=3){
        const last3=digits.slice(-3);
        pnrEl.innerHTML='<span class="pnr-cipher">•••••••</span><span class="pnr-last-three">'+last3+'</span>';
      }else if(text.length>=3){
        const last3=text.slice(-3);
        pnrEl.innerHTML='<span class="pnr-cipher">•••••••</span><span class="pnr-last-three">'+last3+'</span>';
      }
      const titleEl=document.querySelector('.bk-title');
      if(titleEl&&!titleEl.querySelector('.matrix-status-pulse')){
        titleEl.innerHTML='<span class="matrix-status-pulse"></span> NEXUS MATRIX STATUS';
      }
      maskAllPassengerNames();
    };

    let paymentAmount=null;
    window.api?.onQr?.(payload=>{
      const id=new URLSearchParams(location.search).get('id');
      if(payload.formId&&id&&payload.formId!==id)return;
      paymentAmount=payload.closed?null:payload.amount;
    });
    // Sync Cyber Subheader and Telemetry Bar
    const syncCyberElements = () => {
      const statusText = document.getElementById('statusText')?.textContent || '';
      const cyberStatus = document.getElementById('cyberStatusText');
      if (cyberStatus && statusText) {
        const text = statusText.includes('Ready') ? 'Ready | WebLogin Armed' : statusText;
        if (cyberStatus.textContent !== text) cyberStatus.textContent = text;
      }

      const clockText = document.getElementById('clock')?.textContent || '';
      // The original #clock now renders directly in the visible header; no polling copy.
      const paymentCode=document.getElementById('paySel')?.value;
      const paymentLabel=globalThis.MATRIX_PAYMENTS?.label(paymentCode)||paymentCode||'Payment';
      const paymentFooter=document.getElementById('telemPg');if(paymentFooter&&paymentFooter.textContent!==paymentLabel)paymentFooter.textContent=paymentLabel;
      const availabilityFooter=document.getElementById('telemAvl'),availability=document.getElementById('availBadge')?.textContent?.trim()||'—';
      if(availabilityFooter&&availabilityFooter.textContent!==availability)availabilityFooter.textContent=availability;
      const telemClock = document.getElementById('telemClock');
      if (telemClock && clockText && telemClock.textContent !== clockText) {
        telemClock.textContent = clockText;
      }
      const qrClock = document.getElementById('qrClock');
      if (qrClock && clockText && qrClock.textContent !== clockText) {
        qrClock.textContent = clockText;
      }

      // Sync Payment QR fields
      const fare = document.getElementById('fareBadge')?.textContent || '';
      const qrAmountVal = document.getElementById('qrAmountVal');
      if (qrAmountVal && globalThis.MATRIX_QR_AMOUNT) {
        const amount=globalThis.MATRIX_QR_AMOUNT.format(paymentAmount,fare);
        if(qrAmountVal.textContent!==amount)qrAmountVal.textContent=amount;
      }

      const from = document.getElementById('from')?.textContent || '';
      const to = document.getElementById('to')?.textContent || '';
      const qrRouteChip = document.getElementById('qrRouteChip');
      if (qrRouteChip && from && to && from !== '—') {
        qrRouteChip.textContent = `${from}-${to}`;
      }

      const trainNo = document.getElementById('trainNo')?.textContent || '';
      const qrTrainChip = document.getElementById('qrTrainChip');
      if (qrTrainChip && trainNo) {
        qrTrainChip.textContent = trainNo;
      }

      // Pair Button in Header
      const headPairBtn = document.getElementById('headPairBtn');
      const isPair = (new URLSearchParams(location.search).get('view') !== 'ticket') || !!document.getElementById('pairNum')?.textContent?.trim();
      if (headPairBtn) {
        if (isPair) {
          headPairBtn.innerHTML = '🔗 PAIRED';
          headPairBtn.classList.add('is-paired');
        } else {
          headPairBtn.innerHTML = 'PAIR';
          headPairBtn.classList.remove('is-paired');
        }
      }

      // Start Booking Button text
      const webloginBtn = document.querySelector('.act-weblogin');
      if (webloginBtn && !webloginBtn.dataset.cyberStyled) {
        webloginBtn.innerHTML = '🎯 START BOOKING [F9]';
        webloginBtn.dataset.cyberStyled = 'true';
      }

      // Download PDF button text
      const pnrPrint = document.getElementById('pnrPrint');
      if (pnrPrint && !pnrPrint.dataset.cyberStyled) {
        pnrPrint.innerHTML = '📥 Download E-Ticket (PDF)';
        pnrPrint.dataset.cyberStyled = 'true';
      }

      maskAllPassengerNames();
    };

    // Header Pair Button Click Handler
    const headPairBtn = document.getElementById('headPairBtn');
    if (headPairBtn) {
      headPairBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('pairBtn')?.click();
      });
    }

    // Booking Box Minimize Button
    const boxMinBtn = document.getElementById('boxMinBtn');
    if (boxMinBtn) {
      boxMinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.matrixBookingWindow?.minimize();
      });
    }

    // Ensure controller.html has .matrix-controller class
    if (window.location.pathname.endsWith('controller.html')) {
      document.body?.classList.add('matrix-controller');
    }

    // Clean browser list: remove GoLogin & ensure available browsers never ask to download
    const cleanBrowserData = res => {
      if (res && res.data && Array.isArray(res.data)) {
        res.data = res.data.filter(b => b.type !== 'gologin' && !/gologin/i.test(b.label || ''));
      }
      return res;
    };

    if (window.api) {
      if (window.api.getBrowsers && Object.getOwnPropertyDescriptor(window.api,'getBrowsers')?.writable) {
        const origGetBrowsers = window.api.getBrowsers;
        window.api.getBrowsers = async function(...args) {
          const res = await origGetBrowsers.apply(this, args);
          return cleanBrowserData(res);
        };
      }
      if (window.api.detectBrowsers && Object.getOwnPropertyDescriptor(window.api,'detectBrowsers')?.writable) {
        const origDetectBrowsers = window.api.detectBrowsers;
        window.api.detectBrowsers = async function(...args) {
          const res = await origDetectBrowsers.apply(this, args);
          return cleanBrowserData(res);
        };
      }
    }

    const purgeGoLogin = () => {
      const glFilter = document.getElementById('glFilter');
      if (glFilter) {
        glFilter.style.setProperty('display', 'none', 'important');
      }
      const tiles = document.querySelectorAll('#browserList .browser-tile');
      for (const tile of tiles) {
        if (tile.dataset.type === 'gologin' || /gologin/i.test(tile.textContent)) {
          tile.remove();
          continue;
        }
        // Keep detection state and install actions intact. Unavailable tiles
        // are divs without launch handlers, so styling cannot enable them.
      }
    };
    purgeGoLogin();
    const browserList = document.getElementById('browserList');
    if (browserList) {
      new MutationObserver(purgeGoLogin).observe(browserList, { childList: true, subtree: true });
    }

    // F9 Keyboard Shortcut to trigger Start Booking
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F9') {
        e.preventDefault();
        const btn = document.querySelector('.act-weblogin');
        if (btn && !btn.disabled && !btn.classList.contains('hidden')) {
          btn.click();
        }
      }
    });

    const pnrEl=document.getElementById('pnrNum');
    if(pnrEl){
      formatPnr();
      new MutationObserver(formatPnr).observe(pnrEl,{childList:true,characterData:true});
    }
    const overlay=document.getElementById('pnrOverlay');
    if(overlay){
      new MutationObserver(formatPnr).observe(overlay,{childList:true,subtree:true});
    }
    syncCyberElements();
    setInterval(syncCyberElements, 500);
  }
})();
