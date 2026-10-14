'use strict';
module.exports=async function screenActions() {
  const actions=['new-form','open-form','login-data','proxy','payment','history','tools','updates','logs'];
  const results=[];
  for(const action of actions) {
    const result=await window.api.controllerAction(action);
    if(result?.ok===false&&/security|tamper|blocked software|scan could not complete/i.test(result.error||''))throw new Error('Local security rejected '+action+': '+JSON.stringify(result));
    results.push({action,ok:result?.ok!==false,...(result?.ok===false?{reason:result.error}: {})});
  }
  const history=await window.api.listHistory();
  if(!history.ok)throw new Error('Ticket history failed: '+history.error);
  if(!Array.isArray(history.data))throw new Error('Ticket history did not return an array');
  return {actions:results,history:{passed:true,count:history.data.length}};
};
