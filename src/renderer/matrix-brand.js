'use strict';
(() => {
  const brand=text=>text.replace(/Xhamster\s*TS/gi,'Matrix').replace(/Tatkal Software/gi,'Matrix').replace(/\bBrahmos\s+Browser\b/gi,'Matrix Browser').replace(/\bBrahmos\b/gi,'Matrix').replace(/\b(Updating|Quit|Restart|use) TS\b/g,'$1 Matrix');
  const page=location.pathname.split('/').pop().replace('.html','');
  const version=globalThis.MATRIX_BUILD?.version;
  const logo='./assets/matrix-mark.png';
  let favicon=document.querySelector('link[rel="icon"]');if(!favicon){favicon=document.createElement('link');favicon.rel='icon';document.head.append(favicon);}favicon.href=logo;
  document.body.classList.add('matrix-'+page);
  const cleanNode=node=>{
    if(node.nodeType===Node.TEXT_NODE&&!node.parentElement?.closest('script,style,textarea,input,[contenteditable]')) {
      let next=brand(node.nodeValue);
      if(globalThis.MATRIX_PAYMENTS)next=globalThis.MATRIX_PAYMENTS.normalize(next);
      if(version&&node.parentElement?.matches('#appVer,.ver,.bigver'))next='v'+version;
      if(next!==node.nodeValue)node.nodeValue=next;
    } else if(node.nodeType===Node.ELEMENT_NODE) {
      for(const attribute of ['title','aria-label','alt','placeholder'])if(node.hasAttribute(attribute)){
        const value=node.getAttribute(attribute),next=brand(value);if(value!==next)node.setAttribute(attribute,next);
      }
      for(const child of [...node.childNodes])cleanNode(child);
    }
  };
  cleanNode(document.body);
  const title=()=>{const next=brand(document.title);const full=next.startsWith('Matrix')?next:'Matrix · '+next;if(document.title!==full)document.title=full;};
  title();new MutationObserver(title).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});
  const observer=new MutationObserver(records=>{
    for(const record of records){if(record.type==='characterData'||record.type==='attributes')cleanNode(record.target);for(const node of record.addedNodes)cleanNode(node);}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','alt','placeholder']});
  for(const element of document.querySelectorAll('.center,.splash .logo')) {
    const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-mark';element.replaceChildren(image);
  }
  for(const dot of document.querySelectorAll('.topbar .brand > .dot, .matrix-header-logo, .verlogo, .m-logo')){dot.remove();}
  if(page==='app-lock'){const box=document.querySelector('.al-lock');if(box){const image=document.createElement('img');image.src=logo;image.alt='Matrix';image.className='matrix-mark';box.replaceChildren(image);}}
  const vendor=document.getElementById('tgHandle')?.closest('section');if(vendor)vendor.classList.add('matrix-vendor-channel');
  const failBrand=document.getElementById('failBrand');if(failBrand)failBrand.textContent='MATRIX';
  if(page==='splash'){
    const heading=document.querySelector('.title');if(heading)heading.textContent='MATRIX';
    const tagline=document.querySelector('.tagline');if(tagline)tagline.textContent='SMART SOLUTIONS · BETTER TOMORROW';
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
          const mode=document.getElementById('loginFlowSel')?.value,modeLabel=document.getElementById('loginModeVal'),text={auto:document.getElementById('quotaSel')?.value==='GN'?'AUTO · NOW':'AUTO',manual:'MANUAL',direct:'DIRECT',direct2:'MATRIX'}[mode];
          if(modeLabel&&text&&modeLabel.textContent!==text)modeLabel.textContent=text;
        }
      };
      sync();select.addEventListener('change',sync);setInterval(sync,500);
    }
  }
})();
