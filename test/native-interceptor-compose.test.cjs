'use strict';
// A function can be replaced by a native implementation and wrapped by an interceptor at the same time (SetQrPopup, f4021, is
// replaced in settings-ipc.ts and wrapped by qr-delivery.ts). The interceptor must receive the native implementation as
// `original`, in the interpreter and in the compiled runtime, and the native result must pass through it unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createEngine} = require('../src/main/runtime/engine.cjs');
const {createCompiledRuntime} = require('../src/main/runtime/compiled-runtime.cjs');
const definitions = require('../src/main/generated/index.cjs');
const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');

function scenario(name, build) {
  test('native replacement composes with an interceptor: ' + name, async () => {
    const trace = [];
    let stored = {qrPopup: false, keep: 'me'};
    const factories = reconstructedPayment({development: true, enabled: true});
    const options = {
      functionFactories: {f4021: factories.f4021},
      functionInterceptors: {
        async f4021(original, args) {
          trace.push(['before', args.slice(1)]);
          const result = await original(...args);
          trace.push(['after', result]);
          return result;
        },
      },
      globals: {Object, JSON, Array, Promise, Error},
    };
    const runtime = build(options);
    // the handler's own scope sits under the bootstrap scope that holds the settings helpers
    const root = runtime.context(2000, null);
    root[5] = (index, key) => '';
    root[1768] = () => stored;
    root[1769] = next => {trace.push(['write', next]); stored = next;};
    const handler = runtime.makeFunction('f4021', runtime.context(4, root));
    assert.deepEqual(await handler({sender: 'x'}, true), {ok: true});
    assert.deepEqual(await handler({sender: 'x'}, 'yes'), {ok: true});
    assert.deepEqual(trace, [
      ['before', [true]], ['write', {qrPopup: true, keep: 'me'}], ['after', {ok: true}],
      ['before', ['yes']], ['write', {qrPopup: false, keep: 'me'}], ['after', {ok: true}],
    ]);
  });
}

scenario('interpreter', options => createEngine(definitions, options));
scenario('compiled runtime', options => createCompiledRuntime(options));
