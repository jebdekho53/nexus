'use strict';
// Print the approximate readable reference (View8-style listing) of recovered functions.
// The reference can contain wrong branch conditions; the instruction listing from
// tools/review_recovered_function.cjs and the recovered execution remain authoritative.
//
// The reference was produced from a different load of the code cache, so function addresses differ.
// Blocks are matched by content instead: every decoded static string of the function (from
// test/fixtures/payment-strings.json) and every plain string constant must occur in the block, and the
// block with the closest instruction count wins. Usage:
//   node tools/show_readable_reference.cjs f2046 [f2047 ...]
// Reads ../recovered-source locally; the function must be present in the string fixture
// (extend tools/export_payment_fixture.py if it is not).
const fs=require('node:fs'),path=require('node:path');
const definitions=require('../src/main/generated/index.cjs');
const strings=Object.assign({},...Object.values(require('../test/fixtures/payment-strings.json')));
const fixture=require('../test/fixtures/payment-strings.json');
const file=path.resolve(__dirname,'../../recovered-source/main-reconstruction/index.decoded.js');
const text=fs.readFileSync(file,'utf8');
const blocks=text.split(/\n(?=(?:async )?function func_sfi_)/);
const decodedFor=id=>Object.values(fixture[id]??{});
for(const id of process.argv.slice(2)) {
  const definition=definitions[id];
  if(!definition)throw new Error('Unknown recovered function: '+id);
  const wanted=[...new Set([...decodedFor(id),...definition.constants.filter(c=>typeof c==='string'&&c.length>4&&!/^[^A-Za-z0-9]/.test(c))])]
    .filter(s=>s&&s.length>=3).map(s=>'"'+s.replace(/"/g,'\\"')+'"');
  if(!wanted.length||!fixture[id]){console.log('// '+id+': function not in the string fixture; add it to tools/export_payment_fixture.py');continue;}
  const reference=block=>block.replace(/ConstPool\[(\d+):"([^"]*)"\]/g,'"$2"');
  const matches=blocks.map(block=>reference(block)).filter(block=>wanted.every(s=>block.includes(s)));
  matches.sort((a,b)=>Math.abs(a.split('\n').length-definition.code.length/1.7)-Math.abs(b.split('\n').length-definition.code.length/1.7));
  if(!matches.length){console.log('// '+id+': no block contains all '+wanted.length+' strings');continue;}
  console.log('// '+id+': '+matches.length+' candidate block(s); showing the closest\n'+matches[0]+'\n');
}
