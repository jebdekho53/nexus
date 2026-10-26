'use strict';
// Retain the legacy save contract while collecting only username/password.
document.addEventListener('click',event=>{
 if(!event.target.closest('#modalSave'))return;
 const input=document.getElementById('mMobile');if(!input)return;
 const digits=crypto.getRandomValues(new Uint32Array(2));
 input.value=String(6+digits[0]%4)+String(digits[1]%1000000000).padStart(9,'0');
},true);
