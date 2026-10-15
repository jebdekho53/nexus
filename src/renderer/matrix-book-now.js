'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const update=()=>{
  const chip=document.getElementById('loginModeChip');
  if(chip&&document.getElementById('quotaSel')?.value==='GN'&&document.getElementById('loginFlowSel')?.value==='auto'){
   const label=document.getElementById('loginModeVal');
   if(label&&label.textContent!=='AUTO · NOW')label.textContent='AUTO · NOW';
   chip.title='Auto Book now: standard Auto login/browser-check stages without an opening-time countdown. Provider waits and availability still apply.';
  }
 };
 document.addEventListener('change',update);setInterval(update,750);update();
});
