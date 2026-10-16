'use strict';
// Adds or refreshes entries in src/main/payment/recovered-contract.json using definitionFingerprint.
// Usage: node tools/pin_recovered_contract.cjs f1693 f1694 ...   (use --refresh to re-pin every existing entry)
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const definitions=require('../src/main/generated/index.cjs');
const {definitionFingerprint}=require('../src/main/runtime/recovered-contract.cjs');
const file=path.join(root,'src/main/payment/recovered-contract.json');
const contracts=JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2);
const ids=args.includes('--refresh')?Object.keys(contracts):args;
for(const id of ids) {
  if(!definitions[id])throw new Error('Unknown recovered function: '+id);
  contracts[id]={nativeId:definitions[id].nativeId,sha256:definitionFingerprint(definitions[id])};
}
fs.writeFileSync(file,JSON.stringify(contracts,null,2)+'\n');
console.log(Object.keys(contracts).length+' pinned definitions');
