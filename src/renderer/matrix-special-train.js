'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('specialTrain')?.addEventListener('change',event=>{
    // Record only an explicit selection, never an initial render of a saved flag.
    if(event.isTrusted)void window.matrixSpecialTrain?.select(event.target.checked).catch(()=>{});
  });
});
