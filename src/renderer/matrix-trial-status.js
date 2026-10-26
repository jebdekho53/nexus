'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 let badge;
 const update=async()=>{
  if(!window.matrixTrial)return;
  try{const result=await window.matrixTrial.state(),trial=result.trial;
   if(!trial){badge?.remove();badge=null;return;}
   if(!badge){badge=document.createElement('div');badge.id='matrix-trial-status';badge.style.cssText='position:fixed;right:12px;top:4px;z-index:10000;padding:3px 8px;border-radius:5px;background:#effff5;color:#064b2e;font:11px Segoe UI,sans-serif;pointer-events:none';document.body.appendChild(badge);}
   const hours=Math.max(0,Math.ceil((Date.parse(trial.expiresAt)-Date.now())/3600000));
   badge.textContent=trial.active?`Trial: ${trial.pnrRemaining} PNR left · ${hours}h remaining`:'Trial finished — purchase a seller key';
  }catch{}
 };
 update();setInterval(update,15000);
});
