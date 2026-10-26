'use strict';
(()=>{
 function create({username,status,button,modal,check,onResult=()=>{}}){
  let generation=0,bound=false;
  function reset(){generation++;status.className='id-stat hidden';status.textContent='';button.disabled=false;}
  function current(request,id){return request===generation&&username.value.trim()===id&&!modal.classList.contains('hidden');}
  async function verify(){
   const id=username.value.trim();
   if(!id){reset();status.className='id-stat unknown';status.textContent='Enter an IRCTC ID first.';return;}
   const request=++generation;button.disabled=true;status.className='id-stat unknown';status.textContent='Checking…';
   try{
    const response=await check(id);if(!current(request,id))return;
    const record=response?.ok&&response.data?.find(r=>String(r.userId||'').trim().toLowerCase()===id.toLowerCase());
    const state=record&&['verified','unverified','invalid','disabled'].includes(record.state)?record.state:'unknown';
    onResult(id,state);status.className='id-stat '+state;
    status.textContent=state==='verified'?'✓ VERIFIED — this ID can book':state==='unverified'?'✕ UNVERIFIED — '+(record.message||'verify the mobile/email on IRCTC first'):state==='invalid'?'✕ INVALID — IRCTC has no such user ID':state==='disabled'?'✕ DISABLED — this IRCTC account is deactivated':'• Could not check right now — nothing decided';
   }catch{
    if(current(request,id)){status.className='id-stat unknown';status.textContent='• Could not check right now — nothing decided';}
   }finally{if(request===generation)button.disabled=false;}
  }
  return{reset,verify,bind(){if(bound)return;bound=true;username.addEventListener('input',reset);username.addEventListener('change',reset);button.addEventListener('click',verify);}};
 }
 const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else globalThis.MatrixAccountVerification=api;
})();
