document.addEventListener('DOMContentLoaded',async()=>{
 const status=document.getElementById('status'),button=document.getElementById('submit');
 status.textContent=(await window.matrixActivation.state()).message;
 document.getElementById('trial').addEventListener('click',async event=>{event.target.disabled=true;status.textContent='Verifying trial eligibility…';try{const result=await window.matrixActivation.trial();status.textContent=result.ok?'Trial started. Opening Matrix…':result.error;}catch{status.textContent='Trial service unavailable. Try again or contact your seller.';}finally{event.target.disabled=false;}});
 document.getElementById('activation').addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;status.textContent='Checking activation…';try{const result=await window.matrixActivation.activate(document.getElementById('key').value.trim());status.textContent=result.ok?'Activated. Opening Matrix…':result.error;}catch{status.textContent='Unable to reach the Matrix service. Try again.';}finally{button.disabled=false;}});

});

