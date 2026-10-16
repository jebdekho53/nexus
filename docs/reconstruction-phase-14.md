# Reconstruction phase14 —16October2026

Configured TLS transport f1633 and response facade callbacks f1634–f1648 are native in payment/gateway-tls.cjs. Current total:59 entries,165 execution-metadata/code pins,832 application tests passed. No live service/build/deployment occurred.

Forty-four comparison tests cover lower-case headers, form and JSON data serialization, existing cookie snapshot/filter/import policy, redirect/timeout options, configured callback receiver and failure behavior. The returned response facade preserves captured status/body, dynamic URL fallback, flattened header reference, multi-value header arrays, JSON/Buffer conversion and no-op dispose/fetchUid. Invalid inputs and synchronous/asynchronous helper failures retain recovered outcomes.

The seventh complete-chain case enables a synthetic configured-TLS callback, then executes native request routing, TLS transport/facade, Provider QR creation/polling, bank settlement, PNR and finalization. The callback has no network access and returns synthetic response data. Existing TLS/direct/proxy flags are not enabled or modified in application defaults by this migration.

Cookie helpers and the concrete configured TLS callback still delegate to existing application components. HTTP recorder f1649/f1650/f1651 remains recovered and optional. Its guard reads onHttpRecord; with no callback it returns before reading request/response bodies. Preserve that opt-in guard and callback order when migrating. It emits request/response data to the existing callback, not a new endpoint; do not add or restore telemetry. Next migrate this recorder, then remaining gateway-specific PayTM/PhonePe/Razorpay transports and underlying session helpers.
