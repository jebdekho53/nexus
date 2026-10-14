document.addEventListener('DOMContentLoaded',async()=>{
 const status=document.getElementById('status'),button=document.getElementById('submit');
 status.textContent=(await window.nexusActivation.state()).message;
 document.getElementById('activation').addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;status.textContent='Checking activation…';try{const result=await window.nexusActivation.activate(document.getElementById('key').value.trim());status.textContent=result.ok?'Activated. Opening Nexus…':result.error;}catch{status.textContent='Unable to reach the Nexus service. Try again.';}finally{button.disabled=false;}});
 for(const role of ['admin','seller'])document.getElementById(role).addEventListener('click',()=>window.nexusActivation[role]());
});
