'use strict';
const {createHash}=require('node:crypto');

// Include execution metadata as well as instructions: exception handlers,
// register ranges and argument layout can change observable behavior.
function definitionFingerprint(definition) {
  const fields=['kind','language','parameterCount','length','incoming','registerCount','registerCounts','handlers','constants','code'];
  const contract=Object.fromEntries(fields.map(field=>[field,definition[field]]));
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

module.exports={definitionFingerprint};
