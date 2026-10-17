'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();
function withCandidate(action,request,enabled=false){
 const active=enabled===true&&request?.matrixGeneralApiCandidate===true&&request?.form?.quota==='GN';
 return scope.run(active,action);
}
function interceptors(){return {f3406:(original,args)=>scope.getStore()===true?true:original(...args)};}
module.exports={withCandidate,interceptors};
