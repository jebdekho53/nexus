'use strict';
// Adds the static string lookups of the given recovered functions (and, with --descendants, of every function created
// inside them) to test/fixtures/payment-strings.json, using the recovered string decoder itself.
//
// The decoder is ordinary recovered code (bootstrap root slot 5); this tool boots the compiled bundle against the
// recording stub environment used by the equivalence checks (no Electron, filesystem, network, profile or session),
// asks the decoder for each (index, key) pair the functions look up, and appends new function groups to the fixture.
// Existing groups are never rewritten; an existing entry that the decoder disagrees with is an error.
// Usage: node tools/export_decoder_fixture.cjs [--descendants] f3149 [fNNN ...]
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const definitions=require('../src/main/generated/index.cjs');
const support=require('./compiler/check-support.cjs');
const destination=path.join(root,'test/fixtures/payment-strings.json');

const args=process.argv.slice(2);
const withDescendants=args.includes('--descendants');
const requested=args.filter(arg=>/^f\d+$/.test(arg));
if(!requested.length)throw new Error('Name at least one recovered function, e.g. f3149');

const children=new Map();
for(const line of fs.readFileSync(path.join(root,'docs/reconstruction-inventory/function-names.csv'),'utf8').trim().split('\n').slice(1)) {
  const[id,parent]=line.split(',');
  if(!children.has(parent))children.set(parent,[]);
  children.get(parent).push(id);
}
const functions=new Set();
const visit=id=>{functions.add(id);if(withDescendants)for(const child of children.get(id)??[])visit(child);};
requested.forEach(visit);

// (LdaSmi n; Star; LdaConstant key; Star; CallUndefinedReceiver2): the decoder call as the instructions spell it
function lookups(definition) {
  const found=[];
  const code=definition.code;
  for(let index=0;index+4<code.length;index++) {
    const[a,b,c,d,e]=[code[index],code[index+1],code[index+2],code[index+3],code[index+4]];
    if(a[1]==='LdaSmi'&&/^Star\d*$/.test(b[1])&&c[1]==='LdaConstant'&&/^Star\d*$/.test(d[1])&&e[1]==='CallUndefinedReceiver2') {
      const key=definition.constants[c[2][0].c];
      if(Number.isInteger(a[2][0])&&typeof key==='string'&&key.length===4)found.push([a[2][0],key]);
    }
  }
  return found;
}

const run=support.runBootstrap(support.runtimeFactories().compiled);
const decoder=run.root&&run.root[5];
if(typeof decoder!=='function')throw new Error('The bootstrap did not produce the string decoder'+(run.error?': '+run.error:''));

const fixture=JSON.parse(fs.readFileSync(destination,'utf8'));
const known=Object.assign({},...Object.values(fixture));
let added=0,groups=0,conflicts=0;
for(const id of [...functions].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)))) {
  if(!definitions[id])throw new Error('Unknown recovered function '+id);
  if(Object.hasOwn(fixture,id))continue;
  const entries={};
  for(const[index,key]of lookups(definitions[id])) {
    const token=index+'|'+key;
    const text=decoder(index,key);
    if(typeof text!=='string')throw new Error('Decoder returned a non-string for '+token);
    if(Object.hasOwn(known,token)&&known[token]!==text){conflicts++;console.error('Decoder disagrees with the fixture for '+token);}
    entries[token]=text;
  }
  if(!Object.keys(entries).length)continue;
  fixture[id]=entries;groups++;added+=Object.keys(entries).length;
}
if(conflicts)throw new Error(conflicts+' conflicting entries; fixture not written');
// same layout as tools/export_payment_fixture.py: 2-space indent, ASCII-escaped
const text=JSON.stringify(fixture,null,2).replace(/[\u007f-￿]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
fs.writeFileSync(destination,text+'\n','utf8');
console.log('Added '+added+' lookups in '+groups+' function groups ('+functions.size+' functions examined)');
