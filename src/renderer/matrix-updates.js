'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),bridge=window.matrixUpdates;let busy=false;
 const install=document.createElement('button');install.className='btn primary';install.textContent='Download & install update';install.hidden=true;el('reason').closest('.card').append(install);
 const message=text=>{el('reason').textContent=text;};
 async function check(){if(busy)return;busy=true;el('checkBtn').disabled=true;message('Checking Matrix release service…');try{const status=await bridge.check();el('ver').textContent='v'+status.currentVersion;el('autoUpdate').checked=status.autoUpdate===true;el('versionList').replaceChildren();if(!status.ok){el('statusBadge').textContent='Could not check';el('source').textContent='Unavailable';message(status.error);install.hidden=true;return;}el('source').textContent='Matrix release service';el('statusBadge').textContent=status.available?'Update available · v'+status.latestVersion:'✓ Up to date';message(status.available?status.notes||'A new Matrix release is available.':'Latest published release: v'+status.latestVersion);const row=document.createElement('div');row.className='kv';row.textContent='Installed: v'+status.currentVersion+' · Latest: v'+status.latestVersion;el('versionList').append(row);install.hidden=!(status.available&&status.updaterAvailable&&status.installable);}catch(error){message(String(error.message));}finally{busy=false;el('checkBtn').disabled=false;}}
 el('checkBtn').addEventListener('click',check);el('winClose').addEventListener('click',()=>bridge.close());
 el('autoUpdate').addEventListener('change',async()=>{const result=await bridge.settings(el('autoUpdate').checked);if(!result.ok){el('autoUpdate').checked=!el('autoUpdate').checked;message(result.error);}});
 install.addEventListener('click',async()=>{install.disabled=true;el('checkBtn').disabled=true;const result=await bridge.install();if(!result.ok){message(result.error);install.disabled=false;el('checkBtn').disabled=false;}});
 bridge.subscribe(row=>message(row.phase==='error'?row.error:row.phase==='installing'?'Verified. Installing and restarting Matrix…':'Downloading small updater: '+row.percent+'%'));
 check();
});
