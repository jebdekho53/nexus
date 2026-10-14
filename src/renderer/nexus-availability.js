'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('nexusCheckAvailability'),hint=document.getElementById('nexusAvailabilityHint');
 button.addEventListener('click',()=>{
  const missing=['trainNumber','journeyDate','fromStation','toStation'].filter(id=>!document.getElementById(id)?.value.trim());
  if(missing.length){hint.textContent='Enter train number, journey date, From and To stations first.';return;}
  hint.textContent='Refreshing availability for this journey…';
  // Reuse the shipped request, quota mapping, proxy configuration and result UI.
  document.getElementById('journeyDate').dispatchEvent(new Event('change',{bubbles:true}));
  setTimeout(()=>{hint.textContent='The result updates below when the service responds. Refresh again before booking; availability can change.';},1000);
 });
});
