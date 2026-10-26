"""Classify the offline host inventory without probing any remote service."""
import csv,json
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'diagnostics/server-audit'
raw=list(csv.DictReader((OUT/'all-host-references.csv').open(encoding='utf-8-sig')))
inventory=json.loads((OUT/'inventory.json').read_text())
groups=[
 ('Matrix cloud','Enabled by default; activation only in managed release','QR image/payment URI, amount, journey caption and form ID through mobile relay; desktop status/time; license key, device hash and app version for activation; update/portal requests. No IRCTC password found in these specific payloads.', 'matrix.vaidya-gpt.com'),
 ('Legacy vendor','Blocked/replaced by current legacy-services hooks; not a guarantee about native sockets or historical versions','Inherited RailOne server/sensor, CAPTCHA telemetry, OTP websocket, analytics/news/time/config/reporting paths.', 'simplycoding.uk c9fe7387-f.b-cdn.net retired.matrix.invalid'),
 ('Pinned legacy bootstrap','Only the specific captcha.enc URL is blocked; other paths on this host are not globally denied','Inherited encrypted remote configuration loader; disabled local bootstrap replaces it.', 'gist.githubusercontent.com'),
 ('Railway/provider','Feature/session dependent; not exercised in this audit','IRCTC session/authentication, availability, booking/passenger/contact information, booking/payment tokens, reservation details. Secrets are expected to go to the chosen authenticated railway service for the operation.', 'irctc.co.in www.irctc.co.in www.wps.irctc.co.in contents.irctc.co.in www.contents.irctc.co.in www.mps.irctc.co.in'),
 ('RailOne official origin','Inherited configuration; Matrix capabilities currently set railOne:false','SSO/authentication origin for RailOne. Presence is not evidence of current use.', 'aaikyam.indianrailways.gov.in'),
 ('Third-party rail provider','ID check/availability paths enabled; other modes conditional','IRCTC username in account-status URL; journey/train/date/class/quota in availability requests. No password in the reviewed MakeMyTrip fallback request.', 'railways.makemytrip.com rails-cbe.goibibo.com'),
 ('Provider origin/header','Configured origin/referer strings; direct requests not established by these references','Browser/request origin and referrer metadata.', 'www.makemytrip.com www.goibibo.com'),
 ('Train lookup','Feature dependent','Train-search query, route/station/train details; www.railyatri.in also used as origin/referrer.', 'erail.in search.railyatri.in www.railyatri.in'),
 ('Payment gateway','Selected payment method or gateway redirect dependent','Payment/order/transaction identifiers, amount, session/payment tokens and gateway payloads. Redirects can introduce hosts not statically present here.', 'pg.irctcpayments.com secure.paytmpayments.com api.phonepe.com mercury-t2.phonepe.com api.razorpay.com checkout.razorpay.com'),
 ('Payment host patterns','Hostname matching/allowlist/redirect references; not each a hard-coded request','Payment-provider domain families used in URL recognition.', 'razorpay.com paytmpayments.com paytm.com paytm.in phonepe.com irctcipay.com irctcpayments.com billdesk.com'),
 ('Alternate engine example','nexus2.0 demonstration path; not the desktop main entry','Example Paytm transaction form endpoint.', 'securegw.paytm.in'),
 ('Public IP/speed diagnostics','Conditional diagnostics','Public source IP, optionally explicit queried IP, request metadata; speed-test transfer traffic.', 'api.ipify.org ipwho.is speed.cloudflare.com'),
 ('Browser warm-up','Configured warm-up/navigation reference','Browser navigation, IP, user-agent/cookies applicable to that browser context.', 'www.google.com'),
 ('GoLogin','Inherited optional client/download paths; hidden from current browser list, not globally network-blocked','GoLogin API/profile/token/browser-management traffic if this legacy path is invoked.', 'api.gologin.com gologin.com'),
 ('Browser/release download','On-demand download/update/provider-host references','Release metadata and browser/archive downloads; not a booking-password reporting path by itself.', 'github.com api.github.com githubusercontent.com brave.com laptop-updates.brave.com www.microsoft.com'),
 ('Legacy download CDN patterns','Domain-suffix/CDN matching references; not all concrete request URLs','Browser/download hosting recognition.', 'b-cdn.net bunnycdn.com bunny.net'),
 ('Optional AI provider','Recovered AI request path present; activation/use not established in this audit','f1523 POSTs a goal, page URL, error/action history and truncated page DOM to Anthropic with an API key. f1512 applies regex redaction first; complete sensitive-data removal is not established.', 'api.anthropic.com'),
 ('Backend USDT API','Control-plane seller-credit/payment feature, not a desktop railway endpoint','CoinGecko exchange-rate request; TronGrid transaction hash and optional server API key for TRON receipt verification.', 'api.coingecko.com api.trongrid.io'),
 ('Backend user-facing link','Clickable links, not automatically invoked APIs','TRON transaction explorer and wallet/exchange links.', 'tronscan.org trustwallet.com www.binance.com'),
 ('Legacy support link','OTP UI link reference','Telegram navigation if clicked; no automated message submission established.', 't.me'),
 ('Asset provenance','Source URLs recorded in payment-logo-sources.txt; displayed assets are bundled locally','Logo acquisition/provenance references, not proof of a live image request.', 'pay.google.com www.gstatic.com www.phonepe.com navi.com'),
 ('Package/browser installation','Dependency installer/fetcher references; conditional tooling operations','Package/browser/archive downloads. Additional mirrors may be configurable.', 'registry.npmjs.org cdn.playwright.dev storage.googleapis.com'),
]
def locations(host):
 found=[r for r in raw if r['host']==host]
 priority={'application':0,'backend':1,'android':2,'alternate-engine':3,'dependency-runtime':4,'resources':5,'tools':6,'archive':7,'documentation-metadata':8,'tests':9,'backend-tests':10}
 found.sort(key=lambda r:(priority.get(r['scope'],20),r['kind']=='bare-domain','/generated/' in r['file'] or '/compiled/' in r['file'],r['file'],int(r['line'])))
 result=[]
 for r in found:
  label=r['file']+(':'+r['line'] if r['line']!='0' else ':binary-string')+((' ['+r['function']+']') if r['function'] else '')
  if label not in result:result.append(label)
  if len(result)==4:break
 return result
classified=[]
for group,status,data,hosts in groups:
 for host in hosts.split():
  evidence=locations(host)
  if host=='api.anthropic.com':evidence+=['src/main/compiled/part-02.cjs:19529 [f1523]','src/main/compiled/part-02.cjs:19172 [f1512]']
  if not evidence:continue
  classified.append({'host':host,'group':group,'status':status,'data_or_purpose':data,'evidence':'; '.join(evidence)})
with (OUT/'classified-external-servers.csv').open('w',encoding='utf-8-sig',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=list(classified[0]));writer.writeheader();writer.writerows(classified)
reviewed={r['host']:r for r in classified}
with (OUT/'all-candidate-hosts.csv').open('w',encoding='utf-8-sig',newline='') as stream:
 writer=csv.writer(stream);writer.writerow(['host','review_group','scopes','kinds','reference_count','first_evidence'])
 for host,v in inventory['hosts'].items():writer.writerow([host,reviewed.get(host,{}).get('group','Unclassified reference; not established as an application destination'),'; '.join(v['scopes']),'; '.join(v['kinds']),v['references'],'; '.join(locations(host)[:2])])
not_servers=['chrome.app','browser.app','beta.app','edge.app','gologin.app','chromium.app','chatgpt.app','claude.app','handler.app','codex.app','warp.app','cursor.app','ollama.app','studio.app','windsurf.app','zed.app','perplexity.app','navigator.online','modal.in','i.test','r.test','s.test','te.test','n.test','schemas.android.com','www.w3.org','scripts.sil.org']
text=['# Matrix external-server audit — 24 October 2026',
 '**Matrix is the desktop application name; it does not imply local-only operation.** This checkout includes active Matrix cloud connections, third-party railway/payment integrations, inherited vendor code, and dependency/runtime references.',
 '## Scope and method',
 f"Offline scan of **{inventory['counts']['textFiles']:,} text files**, **{inventory['counts']['nativeFiles']} native binaries**, **4,354 recovered functions** and **35,389 decoder lookups** (zero decoder lookup errors). Includes `src`, `services/control-plane`, Android, `nexus2.0`, dependencies, `.runtime`, tools, tests, documentation and recovery sources.",
 f"The raw scan produced **{inventory['references']:,} candidate references** and **{inventory['uniqueCandidateHosts']:,} unique host-like strings**. These are **not counts of contacted servers**: they include examples, XML namespaces, `.app` filenames, SDK documentation, certificate strings and regex/property matches. The classified inventory contains **{len(classified)} relevant external host/domain-pattern entries**.",
 'Private profiles/logs, server data, Git history, validation artifacts and compressed archives were excluded. Other non-text/non-native formats were counted but not parsed. No live login, booking, remote probing or payload transmission was performed for this audit. Runtime decoding used the offline recording-stub bootstrap.',
 '## High-priority verified findings',
 '1. **Automatic Matrix QR upload:** `src/main/runtime/mobile-bridge.cjs:42-55` posts to `/api/relay/desktop/push-qr`. `broadcastQr` invokes it without an opt-in gate. `src/main/runtime/qr-delivery.cjs` supplies form ID, QR data URL, amount, journey caption and payment URI. These fields do not include the IRCTC password in the reviewed path. Code proves an upload attempt is made; server receipt was not independently checked.',
 '2. **Remote command polling:** `mobile-bridge.cjs:58-97` polls `/api/relay/desktop/sync` every 1.2 seconds and executes queued start/stop commands. The reviewed client request has no authentication header or device-scoped relay token.',
 '3. **Relay access separation missing in checked backend:** `services/control-plane/server.cjs` calls `desktop-services.handle` before the origin/content-type guard and before `licensing.handle`. The relay handlers in `desktop-services.cjs` do not perform their own authentication. Latest QR and pending actions are module-global, not partitioned by customer/device. This describes the checked source; the exact deployed server version was not verified.',
 '4. **LAN bridge exposure:** `mobile-bridge.cjs` listens on `0.0.0.0:8085` by default, uses wildcard CORS and exposes QR/stream/action endpoints without an authentication check. Reachability still depends on the network/firewall; `0.0.0.0` is a bind address, not an external destination.',
 '5. **IRCTC username to third-party ID-check service:** `src/main/runtime/id-check.cjs:17` places the username in the MakeMyTrip status URL. That reviewed request does not include the password. The recovered Goibibo provider also contains ID-check/availability paths.',
 '6. **Legacy reporting is intentionally blocked in this build:** `legacy-services.cjs` overrides `f2009`, `f2411`, `f1778`, `f3627`, and `f3381`, and replaces selected endpoint defaults. Known old domains and the pinned bootstrap path are blocked in Node fetch/HTTP, Electron net and session webRequest. This is not a universal native-network firewall.',
 '7. **Matrix licensing is a separate data flow:** activation sends a license key, device hash and app version to Matrix. Update/status/portal calls are additional Matrix connections. No IRCTC-password field was found in those reviewed payloads.',
 '8. **Optional AI DOM transmission exists:** recovered `f1523` sends goal/URL/error/action history and truncated page HTML to `api.anthropic.com`. `f1512` first applies regex redaction for several token/password/email patterns. This audit did not enable the AI path or establish comprehensive redaction of every sensitive page field.',
 '## Classified external inventory',
 '| Host / domain pattern | Group | State | Purpose / data | Source references |',
 '|---|---|---|---|---|']
for r in classified:
 text.append('| `'+r['host']+'` | '+r['group']+' | '+r['status']+' | '+r['data_or_purpose']+' | '+r['evidence']+' |')
text += ['## Local listeners and placeholders',
 '`127.0.0.1` / `localhost` are loopback; the inherited control-server default includes localhost:8443. Desktop mobile bridge defaults to port 8085 on all interfaces. Control-plane backend defaults to loopback port 8082. `192.168.1.100` in mobile HTML is a LAN-address example, not a confirmed external server. Proxy addresses can be user supplied.',
 '## False positives and non-network references',
 'The following host-looking strings were reviewed as local bundle filenames, code expressions, namespaces or font-license metadata rather than application servers: '+', '.join('`'+h+'`' for h in not_servers)+'.',
 'Dependency READMEs, package metadata, funding URLs, test fixtures, TLS trust/certificate data and Electron/Chromium strings remain in the raw inventory. Their presence is not evidence of transmission. Broad library/native entries were not promoted to active application servers without a verified call site.',
 '## Dynamic endpoints and coverage limits',
 '- Railway/payment pages and redirect responses can supply additional hosts at runtime. `gateway-session.cjs` reads origins from the live browser page, while payment redirect modules consume returned form actions. These cannot be enumerated completely from static literals.',
 '- Environment variables, proxy configuration, GoLogin profiles, user-set provider hosts, backend public URLs and remote release manifests can alter some destinations. Matrix updater currently restricts its installer URL to the Matrix origin/path and checks file size/SHA-256; control of that server remains a trust boundary.',
 '- The offline decoder exposes original defaults. Each default must be considered together with current overrides; a decoded legacy domain does not establish that the current runtime uses it.',
 '- No conclusion about historical leakage, remote server operators, deployed server storage, all runtime modes or opaque native socket behavior is justified by this inventory. Binary literal scanning cannot detect encrypted or constructed endpoints. Password exfiltration was not established by the reviewed Matrix paths.',
 '- The inherited code contains a booking/client-update reporting implementation with account/PNR/route/device metadata. Current `f2009` overrides disable that implementation, but a complete reachability review of other persistence/native callbacks is still needed before claiming zero reporting.',
 '## Evidence artifacts',
 '- `diagnostics/server-audit/classified-external-servers.csv`: reviewed external host/domain-pattern inventory with group, status, purpose and source locations.',
 '- `diagnostics/server-audit/all-host-references.csv`: all candidate references, including dependencies, archives, documentation and false positives.',
 '- `diagnostics/server-audit/all-candidate-hosts.csv`: one row per candidate host-like string, including unclassified references and their scope.',
 '- `diagnostics/server-audit/inventory.json`: grouped evidence and coverage counts.',
 '- `diagnostics/server-audit/runtime-decoded-hosts.json`: host-only decoder evidence with recovered function IDs.',
 '- `tools/audit_external_servers.py`, `tools/audit_decoded_servers.cjs`, `tools/build_server_audit_report.py`: repeatable offline audit scripts.',
 '## Recommended repair order',
 'Disable default cloud QR uploads and unauthenticated remote commands first; then add explicit opt-in, authentication and per-device/customer isolation if mobile relay is retained. Restrict local bridge exposure. Make third-party ID checks optional. Audit native and browser network behavior per selected mode before any local-only/no-leak guarantee. These are findings and recommendations; this audit did not change application network policy.'
]
report=ROOT/'docs/external-servers-2026-10-24.md';report.write_text('\n\n'.join(text).replace('|\n\n|','|\n|')+'\n',encoding='utf-8')
print(json.dumps({'classifiedEntries':len(classified),'groups':dict(Counter(r['group'] for r in classified)),'report':str(report)}))
