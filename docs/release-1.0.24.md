# Matrix 1.0.24: availability request adapter correction

The promoted default f2269 adapter had reversed dependencies: root slot351 is f505, the availability URL builder; root slot369 is f516, the POST body builder. The helper's corrected `(url,body)` calling convention exposed this incorrect adapter mapping. Earlier builder integration tests supplied the two builders directly in the right order and did not exercise the production adapter.

Corrected standard mappings: buildUrl=351, buildBody=369. Corrected optional new-site mappings: newSiteUrl=353 (constant endpoint), newSiteBody=371 (body builder). The availability helper accepts the endpoint/body forms without invoking an endpoint string as a function.

New regression coverage in test/availability-default-adapter.test.cjs executes the default f2269 adapter, actual recovered standard builders and the default f2064 transport through api.call in both instruction and compiled runtimes. Both standard and new-site variants assert method, URL and body type/contents. General GN is covered without a scheduled opening target.

This is a verified client request-construction bug, not proof that every live High Load response has this cause. Existing retry/session/proxy/slot guards remain. Real IRCTC GN-to-QR success must be retested on this version; offline tests cannot guarantee it.
