'use strict';
(async()=>{
  const list=document.getElementById('logList'),empty=document.getElementById('empty'),banner=document.getElementById('runInfo');
  const rows=[],ids=new Set();
  const filter=document.createElement('select');filter.className='btn sm';filter.setAttribute('aria-label','Filter log runs');
  const all=document.createElement('option');all.value='all';all.textContent='All runs';filter.append(all);
  const runIds=new Set();const bar=document.getElementById('filterBar');bar.append(filter);
  filter.onchange=()=>{for(const item of list.children)item.hidden=filter.value!=='all'&&item.dataset.run!==filter.value;};
  const clock=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hour12:false});
  function append(row){
    if(!window.MatrixLogPolicy?.isBookingRow(row))return;
    if(ids.has(row.id))return;ids.add(row.id);rows.push(row);
    const item=document.createElement('div');item.className='nx-log '+row.kind+' '+(['info','warn','error','success'].includes(row.level)?row.level:'info');
    item.dataset.run=row.runId;item.hidden=filter.value!=='all'&&filter.value!==row.runId;
    if(!runIds.has(row.runId)){runIds.add(row.runId);const option=document.createElement('option');option.value=row.runId;option.textContent=row.runId==='app'?'App':'Run '+row.runId.slice(0,8);filter.append(option);if(runIds.size>1)bar.style.display='flex';}
    for(const text of [clock.format(new Date(row.at)),row.elapsedSeconds===null?'—':'+'+row.elapsedSeconds.toFixed(1)+'s',(row.runId==='app'?'':row.runId.slice(0,8)+' · ')+row.stage,row.message+(row.kind==='heartbeat'?' · step '+row.stepSeconds.toFixed(1)+'s':'')]){const cell=document.createElement('span');cell.textContent=text;item.append(cell);}
    list.append(item);empty.hidden=true;banner.textContent='IST · '+row.stage+' · '+(row.elapsedSeconds??0)+'s elapsed';banner.classList.remove('ri-idle');
    if(rows.length>5000){const removed=rows.shift();ids.delete(removed.id);list.firstChild?.remove();}
    if(document.getElementById('follow').checked)item.scrollIntoView({block:'end'});
  }
  if(!window.matrixLogs){empty.textContent='Log bridge unavailable. Restart Matrix to load the current build.';return;}
  window.matrixLogs.subscribe(append);
  for(const row of await window.matrixLogs.snapshot())append(row);
  document.getElementById('clearBtn').onclick=async()=>{await window.matrixLogs.clear();rows.length=0;ids.clear();list.replaceChildren();empty.hidden=false;};
  document.getElementById('downloadBtn').onclick=()=>{const selected=filter.value==='all'?rows:rows.filter(row=>row.runId===filter.value);const url=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='Matrix-activity.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.getElementById('winClose').onclick=()=>window.close();
})();
