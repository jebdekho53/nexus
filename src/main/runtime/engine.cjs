'use strict';
// Implementation: src/ts/main/runtime/engine.ts (compiled by `npm run build:ts` into build/ts).
// The default dynamic import stays here so that `import()` is a real ECMAScript import resolved from this file.
const engine=require('./ts-build.cjs').loadTs('main/runtime/engine');
module.exports={...engine,createEngine:(definitions,options={})=>engine.createEngine(definitions,options,specifier=>import(specifier))};
