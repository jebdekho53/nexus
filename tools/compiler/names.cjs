'use strict';
// Loads docs/reconstruction-inventory/function-names.csv: id -> {parent, hint}. The hint is the property/method name
// seen at the closure's creation site (a review aid, not proof of the function's own name).
const fs=require('node:fs'),path=require('node:path');

function loadNames(file=path.resolve(__dirname,'../../docs/reconstruction-inventory/function-names.csv')) {
  const names=new Map();
  if(!fs.existsSync(file))return names;
  const rows=fs.readFileSync(file,'utf8').split('\n').slice(1);
  for(const row of rows) {
    if(!row)continue;
    const[id,parent,hint]=row.split(',');
    names.set(id,{parent,hint:hint||''});
  }
  return names;
}

// JavaScript-identifier form of a hint ("ready-to-show" -> "ready_to_show")
const identifierOf=hint=>hint.replace(/[^A-Za-z0-9_$]/g,'_').replace(/^(\d)/,'_$1');

module.exports={loadNames,identifierOf};
