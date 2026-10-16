# Reconstruction phase15 —16October2026

Optional HTTP recorder f1649/f1650/f1651 is native in payment/http-record.cjs. Current total:60 entries,168 execution-metadata/code pins,864 application tests passed. No live service/build/deployment occurred.

Thirty-two tests compare opt-in callback behavior, data/form formatting, header references, error markers, request/response truncations, synchronous/asynchronous failures and callback timing. With onHttpRecord absent/falsy it returns before reading options or response bodies. Existing limits remain600characters per form value,2000for data,200for the error marker and16000for response body. Callback return promises are not awaited; synchronous internal diagnostic errors are swallowed as recovered.

This migration does not install a callback, enable recording or add a transport/destination. The optional callback's existing request/response field contract is preserved; callback wiring/redaction stays an application responsibility. Fixtures use synthetic fields only. Retired-vendor reporting remains disabled by the existing f2009 override.

All seven complete-chain comparisons now use the native recorder with an explicitly provided synthetic callback and consistent cached response interfaces, including configured TLS response facades and browser-close survivor handling. This is offline behavioral evidence, not real booking success or speed.

Next migrate remaining PayTM/PhonePe/Razorpay gateway transports, starting with PayTM redirect f1684/f1685/f1686. Session/cookie helpers and the broader application/bootstrap still execute recovered definitions. No generated definitions were removed.
