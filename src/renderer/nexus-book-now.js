'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const update=()=>{
  const chip=document.getElementById('loginModeChip');
  if(chip&&document.getElementById('quotaSel')?.value==='GN'&&document.getElementById('loginFlowSel')?.value==='auto'){
   if(chip.textContent!=='AUTO · NOW')chip.textContent='AUTO · NOW';
   chip.title='Auto Book now: automatic login, current session, required submit wait, then QR. Availability and provider rules apply.';
  }
 };
 document.addEventListener('change',update);setInterval(update,750);update();
});
