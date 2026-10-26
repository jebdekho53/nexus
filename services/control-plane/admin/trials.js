'use strict';
document.addEventListener('matrix-session-ready',async()=>{
 if(document.body.dataset.role!=='admin')return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=value=>value?new Date(value).toLocaleString(): '—';
 try{
  const response=await fetch('/api/admin/trials');if(!response.ok)return;
  const data=await response.json();let panel=document.getElementById('trial-devices');
  if(!panel){panel=document.createElement('details');panel.id='trial-devices';panel.style.cssText='margin:18px 0;padding:14px;background:white;border:1px solid #d7e5df;border-radius:10px';document.getElementById('dashboard').appendChild(panel);}
  panel.innerHTML='<summary>Free trials & device IPs ('+data.trials.length+')</summary><div style="overflow:auto"><table><thead><tr><th>Trial</th><th>PNR used</th><th>Expires</th><th>Public IP / last seen</th><th>Pending runs</th></tr></thead><tbody>'+data.trials.map(t=>'<tr><td>'+esc(t.id.slice(0,8))+' · '+(t.active?'Active':'Finished')+'</td><td>'+t.pnrUsed+' / '+t.pnrLimit+'</td><td>'+esc(date(t.expiresAt))+'</td><td>'+t.deviceAccess.map(d=>esc(d.lastIp)+'<br>'+esc(date(d.lastSeenAt))).join('<hr>')+'</td><td>'+t.pendingRuns+'</td></tr>').join('')+'</tbody></table></div><p>Public IP is the observed network/VPN exit, not verified physical location.</p>';
 }catch{}
});
