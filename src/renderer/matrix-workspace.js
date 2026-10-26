'use strict';
(()=>{
 const init=()=>{
  const sections=[...document.querySelectorAll('.editor-section')],buttons=[...document.querySelectorAll('[data-editor-target]')];
  if(sections.length){
   const scroller=document.querySelector('.editor-workspace');
   const mark=index=>buttons.forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-current',i===index?'location':'false')});
   sections.forEach(s=>{s.hidden=false;s.classList.remove('editor-active')});
   const jump=index=>{const section=sections[index];if(!section)return;const top=section.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-18;scroller.scrollTo({top,behavior:'smooth'});mark(index)};
   buttons.forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.editorTarget))));
   let pending=false;const sync=()=>{pending=false;const edge=scroller.getBoundingClientRect().top+80;let index=0;sections.forEach((s,i)=>{if(s.getBoundingClientRect().top<=edge)index=i});if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4)index=sections.length-1;mark(index)};
   scroller.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(sync)}},{passive:true});
   document.getElementById('form').addEventListener('invalid',e=>{const s=e.target.closest('.editor-section');if(s)jump(Number(s.dataset.editorIndex));},true);
   mark(0);
  }
  const area=document.getElementById('pasteArea'),count=document.getElementById('pasteLineCount');if(area&&count){const sync=()=>{const n=area.value.split(/\r?\n/).filter(s=>s.trim()).length;count.textContent=n+' line'+(n===1?'':'s')};area.addEventListener('input',sync);sync();}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
