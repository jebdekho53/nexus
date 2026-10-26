'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const update=()=>{
  const chip=document.getElementById('loginModeChip');
  const label=document.getElementById('loginModeVal'),mode=document.getElementById('loginFlowSel')?.value;
  const display={auto:document.getElementById('quotaSel')?.value==='GN'?'AUTO · NOW':'AUTO',manual:'MANUAL',direct:'DIRECT',direct2:'MATRIX'}[mode];
  // Recovered rendering still updates the source text. Render a stable label
  // from the selected value so two periodic writers cannot alternate it.
  if(label&&display&&label.dataset.display!==display)label.dataset.display=display;
  if(chip&&document.getElementById('quotaSel')?.value==='GN'&&document.getElementById('loginFlowSel')?.value==='auto'){
   chip.title='Auto Book now: standard Auto login/browser-check stages without an opening-time countdown. Provider waits and availability still apply.';
  }
 };
 document.addEventListener('change',update);setInterval(update,750);update();
});
