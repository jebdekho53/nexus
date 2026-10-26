(()=>{
 const init=()=>{
  const panel=document.getElementById('qrOverlay'),close=document.getElementById('matrixQrClose');
  if(!panel||!close)return;
  const reopen=document.createElement('button');
  reopen.type='button';reopen.id='matrixQrReopen';reopen.textContent='Show QR';reopen.hidden=true;
  reopen.title='Show the current payment QR';
  document.querySelector('.bb-statusrow')?.append(reopen);
  close.addEventListener('click',()=>{panel.classList.add('hidden');reopen.hidden=false;});
  reopen.addEventListener('click',()=>{panel.classList.remove('hidden');reopen.hidden=true;});
  const reset=()=>{reopen.hidden=true;};
  document.addEventListener('click',event=>{if(event.target.closest('.act-start,.act-startnow,.act-weblogin'))reset();});
  new MutationObserver(()=>{
   if(!panel.classList.contains('hidden')||!document.getElementById('pnrOverlay')?.classList.contains('hidden'))reset();
  }).observe(panel.parentElement,{attributes:true,subtree:true,attributeFilter:['class']});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
