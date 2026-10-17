'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const timer=document.getElementById('matrixGeneralTimer'),quota=document.getElementById('quotaSel');let state;
 const draw=()=>{timer.hidden=quota?.value!=='GN';if(timer.hidden)return;timer.textContent=state?.remainingMs!=null?'Submit '+Math.ceil(state.remainingMs/1000)+'s':state?.active?'Run '+Math.floor(state.elapsedSeconds||0)+'s':'Book now';};
 globalThis.matrixBookingTiming?.subscribe(row=>{state=row;draw();});document.addEventListener('change',draw);draw();
});
