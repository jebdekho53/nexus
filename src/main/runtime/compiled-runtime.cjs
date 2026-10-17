'use strict';
// Implementation: src/ts/main/runtime/compiled-runtime.ts (compiled by `npm run build:ts` into build/ts).
// The default dynamic import stays here so that `import()` is a real ECMAScript import resolved from this file.
const runtime=require('./ts-build.cjs').loadTs('main/runtime/compiled-runtime');
module.exports={...runtime,createCompiledRuntime:(options={})=>runtime.createCompiledRuntime({fallbackImport:specifier=>import(specifier),...options})};
