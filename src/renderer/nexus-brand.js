'use strict';
(() => {
  const brand=text=>text.replace(/Xhamster\s*TS/gi,'Nexus').replace(/Tatkal Software/gi,'Nexus').replace(/\bBrahmos\s+Browser\b/gi,'Nexus Browser').replace(/\bBrahmos\b/gi,'Nexus').replace(/\b(Updating|Quit|Restart|use) TS\b/g,'$1 Nexus');
  const page=location.pathname.split('/').pop().replace('.html','');
  const version=globalThis.NEXUS_BUILD?.version;
  const logo='./assets/nexus-mark.svg';
  document.body.classList.add('nexus-'+page);
  const cleanNode=node=>{
    if(node.nodeType===Node.TEXT_NODE&&!node.parentElement?.closest('script,style,textarea,input,[contenteditable]')) {
      let next=brand(node.nodeValue);
      if(globalThis.NEXUS_PAYMENTS)next=globalThis.NEXUS_PAYMENTS.normalize(next);
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
  const title=()=>{const next=brand(document.title);const full=next.startsWith('Nexus')?next:'Nexus · '+next;if(document.title!==full)document.title=full;};
  title();new MutationObserver(title).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});
  const observer=new MutationObserver(records=>{
    for(const record of records){if(record.type==='characterData'||record.type==='attributes')cleanNode(record.target);for(const node of record.addedNodes)cleanNode(node);}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','alt','placeholder']});
  for(const element of document.querySelectorAll('.center,.verlogo,.m-logo,.splash .logo')) {
    const image=document.createElement('img');image.src=logo;image.alt='Nexus';image.className='nexus-mark';element.replaceChildren(image);
  }
  const vendor=document.getElementById('tgHandle')?.closest('section');if(vendor)vendor.classList.add('nexus-vendor-channel');
  const failBrand=document.getElementById('failBrand');if(failBrand)failBrand.textContent='NEXUS';
  if(page==='splash'){
    const heading=document.querySelector('.title');if(heading)heading.textContent='NEXUS';
    const tagline=document.querySelector('.tagline');if(tagline)tagline.textContent='YOUR WORKSPACE. CONNECTED.';
    const status=document.querySelector('.status');if(status)status.textContent='Preparing your workspace…';
  }
  if(page==='form'||page==='booking-box'){
    const select=document.getElementById(page==='form'?'paymentMethod':'paySel');
    if(select){
      const summary=document.createElement('div');summary.className='nexus-payment-summary';if(page==='form')select.parentElement.append(summary);
      let previous;
      const sync=()=>{
        for(const option of select.options){const label=globalThis.NEXUS_PAYMENTS?.labels[option.value];if(label&&option.textContent!==label)option.textContent=label;}
        if(select.value!==previous){previous=select.value;summary.textContent='Selected: '+(globalThis.NEXUS_PAYMENTS?.label(previous)||previous||'Not selected');}
      };
      sync();select.addEventListener('change',sync);setInterval(sync,500);
    }
  }
})();
