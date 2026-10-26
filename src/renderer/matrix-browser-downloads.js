'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const list=document.getElementById('browserDownloads'),status=document.getElementById('browserDownloadStatus');if(!list)return;
 let loading=false,lastCatalog='';
 async function refresh(){if(loading)return;loading=true;try{
  const items=await window.matrixBrowsers.catalog(),key=JSON.stringify(items);if(key===lastCatalog)return;lastCatalog=key;list.replaceChildren();
  for(const item of items){
   const row=document.createElement('div');row.className='browser-download-row';
   const info=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');title.textContent=item.name+(item.referenceVersion?' · '+item.referenceVersion:'');note.textContent='Installed: '+(item.installedVersion||'Not found')+' · Tested: '+(item.targetVersion||item.referenceVersion)+' · '+item.kind;info.append(title,note);row.append(info);
   for(const [label,action]of [[item.ready?'Ready':item.installState?.phase==='downloading'?'Downloading '+item.installState.percent+'%':['extracting','installing'].includes(item.installState?.phase)?'Installing…':item.installState?.phase==='checking'?'Checking…':item.automatic?item.action:'Official download','open'],['Copy link','copy']]){const button=document.createElement('button');button.type='button';button.className='btn sm'+(action==='open'?' primary':'');button.textContent=label;button.disabled=!item.url||(action==='open'&&(item.ready||['downloading','extracting','checking','installing'].includes(item.installState?.phase)));button.addEventListener('click',async()=>{try{if(item.automatic&&action==='open'){button.disabled=true;status.textContent=item.action+' '+item.name+' to tested version… Close this browser before installing.';}const result=await window.matrixBrowsers[action](item.id);status.textContent=result?.ok?(item.automatic?(action==='copy'?'Browser download link copied.':item.name+' installed at the tested version.'):(action==='copy'?'Download link copied.':'Official download page opened.')):(result?.error||'Download link unavailable.');void refresh();}catch{status.textContent='Could not open/copy link.';}});row.append(button);}
   list.append(row);
  }
 }catch{status.textContent='Restart Matrix to load browser download links.';}finally{loading=false;}}
 window.addEventListener('focus',refresh);const timer=setInterval(refresh,1000);window.addEventListener('beforeunload',()=>clearInterval(timer));void refresh();
});
