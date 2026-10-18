'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const loginIntent=new AsyncLocalStorage();
function withImmediateLogin(action){return loginIntent.run(true,action);}
// GN is ordinary General booking. 8AM is a separate scheduled opening mode.
// Check before the recovered loginTargetCache so changing a panel to GN cannot
// reuse a previously calculated scheduled login target.
function bookingTiming(){
 return {
  f2281(original,args){return loginIntent.getStore()===true||args[0]?.quota==='GN'?null:original(...args);},
  f2287(original,args){
    // Option 1: Fast Mode (Cap API submit boarding hold to 7s instead of 45s)
    if(args[2]!=null&&args[2]>7)args[2]=7;
    return original(...args);
  },
 };
}
module.exports={bookingTiming,withImmediateLogin};
