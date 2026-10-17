'use strict';
// Implementation: src/ts/main/runtime/runtime-support.ts (compiled by `npm run build:ts` into build/ts).
// The default dynamic import stays here so that `import()` is a real ECMAScript import resolved from this file.
const support=require('./ts-build.cjs').loadTs('main/runtime/runtime-support');
module.exports={...support,createSupport:globals=>support.createSupport(globals,specifier=>import(specifier))};
