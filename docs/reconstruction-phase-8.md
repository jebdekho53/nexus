# Reconstruction phase 8 — 16 October 2026

PaymentRedirect f1667 and form parsers f1609/f1610 are native in payment/gateway-redirect.cjs. Current total:43 entries,112 pinned definitions,575 passing tests. Public1.0.11 remains unchanged; no live service requests were made.

Twenty-one tests compare actual recovered parsing, payload construction, captured request receiver, status/log/error order, blocking detection and bounded retries. The same form object is reused across attempts. Missing unblocked action allows four attempts and700/1400/2100ms sleeps; action or blocking text stops immediately. Network/header/text exceptions propagate rather than entering generic reqRetry. The final action is always passed to noteGatewayPage after an ordinary loop completion, including an empty action.

Parsers deliberately preserve existing quote/order/case/regex behavior and return raw attribute values. They do not evaluate HTML or decode entities. Hidden-field name matching is inherited regex construction, not a newly generalized parser.

The full-chain comparison now executes native PaymentRedirect, payload/header generation and parsing before the synthetic provider QR step. Real browser/network/payment effects remain mocked. This establishes compatibility, not a measured timing reduction.

Next: provider QR creation f1668/f1669–f1672 plus app-config/amount parsers f1602/f1608; provider QR polling f1673 and remaining bank/gateway methods remain recovered. The static fixture contains upcoming functions for inspection only. Review source instructions and extend parity/error/actor-isolation tests before registering additional factories.
