'use strict';

// Executed only in the isolated smoke profile, through the shipped preload API.
module.exports = async function storageRoundTrip() {
  const api=window.api;
  const label='Source reconstruction storage test';
  const draft={
    id:'efd6c934-513f-4cc9-9d6b-814016000001',label,
    account:{username:'local-test-only',password:'synthetic',mobileNumber:'9999999999'},
    journey:{trainNumber:'00000',journeyDate:'2099-01-01',origin:'TEST',destination:'DEMO',quota:'GN',classCode:'SL'},
    options:{},payment:{method:'paytm'},passengers:[],proxy:{enabled:false},timing:{},updatedAt:Date.now(),
  };
  const saved=await api.saveForm(draft);
  const rows=await api.listForms();
  const forms=Array.isArray(rows)?rows:rows.data;
  const item=forms?.find(form=>form.label===label);
  const id=item?.id||saved?.data?.id;
  if(!saved.ok||!id)throw new Error('Saved test form not returned by listForms: '+JSON.stringify({saved,rows}));
  try {
    const loaded=await api.getForm(id);
    const form=loaded?.data||loaded;
    if(form.label!==label||form.account?.username!==draft.account.username)throw new Error('Form round-trip mismatch');
    if(form.payment?.method!=='paytm')throw new Error('Selected Paytm QR changed during form save/read');
    if(form.journey?.quota!=='GN')throw new Error('General Book now quota changed during form save/read');
    const types=await import('./assets/types-B0-2ZUtm.js');
    const request=types.J(form);
    if(request.quota!=='GN')throw new Error('General Book now changed to a scheduled quota');
    if(request.paymentMethod!=='paytm'||request.paymentMethodDisplay!=='paytm')throw new Error('Form converter changed the selected QR provider');
    await api.openFormWindow(id);await api.openFormWindow(id);
    await api.openBookingBox(id);
    const license=await api.getBoxLicenseInfo(id);
    if(!license.ok||license.data?.gateEnabled!==false)throw new Error('Local vendor license gate is still enabled');
  } finally {
    await api.deleteForm(id);
  }
  const after=await api.listForms();
  const remaining=Array.isArray(after)?after:after.data;
  if(remaining?.some(form=>form.id===id))throw new Error('Test form was not deleted');
  const select=document.getElementById('paymentMethod');
  if(!document.getElementById('matrixCheckAvailability')||!document.getElementById('matrixAvailabilityHint'))throw new Error('Explicit form availability refresh is missing');
  const quota=document.getElementById('quota');
  quota.value='GN';quota.dispatchEvent(new Event('change',{bubbles:true}));
  select.value='paytm';select.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,600));
  if(quota.value!=='GN'||![...document.querySelectorAll('.dd-label')].some(element=>element.textContent.includes('Book now')))throw new Error('General Book now is not selectable in the visible quota dropdown');
  const paymentUi={value:select.value,label:select.selectedOptions[0]?.textContent,summary:document.querySelector('.matrix-payment-summary')?.textContent,visibleLabels:[...document.querySelectorAll('.dd-label')].map(element=>element.textContent)};
  if(paymentUi.value!=='paytm'||paymentUi.label!=='Paytm QR'||paymentUi.summary!=='Selected: Paytm QR'||!paymentUi.visibleLabels.includes('Paytm QR'))throw new Error('Rendered payment label does not match the actual selection: '+JSON.stringify(paymentUi));
  return {passed:true,operations:['saveForm','listForms','getForm','Paytm QR save/read/request consistency','openFormWindow twice','openBookingBox','getBoxLicenseInfo','deleteForm'],paymentUi,localLicenseRequired:false,syntheticData:true};
};
