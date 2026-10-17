'use strict';
const fs=require('node:fs');
const path=require('node:path');

// Loads a migrated TypeScript module from its compiled output (build/ts, produced by `npm run build:ts` from
// src/ts). The .cjs files that used to hold the implementation are now thin entry points that call this, so every
// existing require() site keeps working. A missing build gives an actionable error instead of a bare MODULE_NOT_FOUND.
const buildRoot=path.join(__dirname,'..','..','..','build','ts');

function loadTs(relativePath) {
  const file=path.join(buildRoot,relativePath+'.js');
  if(!fs.existsSync(file))
    throw new Error('Compiled TypeScript output is missing ('+path.relative(path.join(__dirname,'..','..','..'),file)+'). Run `npm install` and `npm run build:ts` first.');
  return require(file);
}

module.exports={loadTs,buildRoot};
