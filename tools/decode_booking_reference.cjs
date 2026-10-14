const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('recovery/formatted-frontend/renderer/assets/booking-box-Bsv5-yxI.js','utf8');
const functions=source.match(/^function _0x(?:8b90|28a6)\([\s\S]*?^\}/gm);
const context=vm.createContext({});
vm.runInContext(functions.join('\n')+'\n'+source.slice(0,source.indexOf('\nimport')),context,{timeout:10000});
const decoded=source.replace(/_0x8b90\((0x[0-9a-f]+)\)/g,(_all,number)=>JSON.stringify(context._0x8b90(Number(number))));
fs.writeFileSync('diagnostics/booking-reference-decoded.js',decoded);
