'use strict';
const {runProviderQr}=require('../payment/provider-qr.cjs');
const {bookingPaymentUrl,bookingDataUrl}=require('../payment/request-url.cjs');
const {startPaytmWatch}=require('../payment/paytm-watch.cjs');
const {runPaytm}=require('../payment/paytm.cjs');
const {runPhonePe}=require('../payment/phonepe.cjs');
const {bookingPaymentBody}=require('../payment/request-body.cjs');
const {isBankProcessingError,paymentResponseError,isBrowserClosedError}=require('../payment/payment-error.cjs');
const {paymentCandidates,choosePaymentBank}=require('../payment/gateway-selection.cjs');
const {runRazorpay}=require('../payment/razorpay.cjs');
const {initializePayment}=require('../payment/payment-init.cjs');
const {dispatchPayment}=require('../payment/gateway-dispatch.cjs');
const {settlePayment}=require('../payment/settlement.cjs');
const {canRequestPnr,waitForPnrRetry}=require('../payment/pnr-lifecycle.cjs');
const {pollBookingData}=require('../payment/booking-data.cjs');
const {emptyBooking,normalizeBooking}=require('../payment/booking-result.cjs');
const {bookingRetryDelay}=require('../payment/retry-delay.cjs');
const {sessionTokens,paymentPageReferrer,paymentRequestId}=require('../payment/session-context.cjs');
const {finishBooking,finishBookingCore}=require('../payment/finish-booking.cjs');
const {attachPrintTicket}=require('../payment/print-ticket.cjs');
const {requestBookingData,requestPrintTicket}=require('../payment/gateway-requests.cjs');
const {gatewayHeaders}=require('../payment/gateway-headers.cjs');
const {retryGatewayRequest}=require('../payment/gateway-retry.cjs');
const {clientHints,gatewayHints,liveProviderOrigin,setGatewayPageOrigin,gatewayPageReferrer,originFor}=require('../payment/gateway-session.cjs');
const {disposeSurvivor,disposeDirectContext,useProxiedRequest,useSurvivorProxy,setProxyFallback,armSurvivor,ensureDirectContext,sleep}=require('../payment/gateway-lifecycle.cjs');
const {hiddenFormValue,formAction,paymentRedirect,paytmRedirectForm,paytmRedirect}=require('../payment/gateway-redirect.cjs');
const {appConfig,qrAmount,commandStatus}=require('../payment/qr-response.cjs');
const {createProviderQr}=require('../payment/provider-qr-request.cjs');
const {fetchProviderEncdata,pollProviderQr}=require('../payment/provider-qr-poll.cjs');
const {interstitialDelay,bankResponse,paytmBankResponse}=require('../payment/bank-response.cjs');
const {gatewayRequest}=require('../payment/gateway-routing.cjs');
const {sendViaWebTlsGateway}=require('../payment/gateway-tls.cjs');
const {recordHttp}=require('../payment/http-record.cjs');
const {paytmAppData,paytmQrImage,paytmOrderFromUrl,paytmOrderFromData,fetchPaytmQr}=require('../payment/paytm-qr-request.cjs');
const {paytmOriginPage,paytmPageRequest,disposePaytmPage}=require('../payment/paytm-page.cjs');
const {pollPaytmStatus}=require('../payment/paytm-status.cjs');
const {waitForPaytmWs}=require('../payment/paytm-websocket.cjs');
const {razorpayLocation,parseRazorpayCheckoutPage,razorpayCheckout,razorpaySessionToken,razorpayPollUrl,razorpayCreate,pollRazorpay}=require('../payment/razorpay-transport.cjs');
const {walletVerify}=require('../payment/wallet-verify.cjs');
const rules=require('../booking/rules.cjs');
const providerPage=require('../booking/provider-page.cjs');
const serverTime=require('../booking/server-time.cjs');
const timeHelpers=require('../booking/time-helpers.cjs');
const {attachDuplicateLoginWatch,aiResolve,ensureAuthToken,relaunchIfLoggedOut,dumpAuthState,printTicketInBrowser,stopWith,updateLiveForm,controlProxyContext,routeGatewayThroughFormProxy,cancelPayment,stoppedResult,highLoadDelay,focusBrowser,hideBrowser,minimizeBrowser}=require('../booking/controls.cjs');
const {runUiBooking}=require('../booking/ui-booking.cjs');
const {runBrowserBooking}=require('../booking/browser-booking.cjs');
const {runRailOne}=require('../booking/railone-booking.cjs');
const {callTransport}=require('../booking/transport-retry.cjs');
const {safeCall}=require('../booking/safe-call.cjs');
const {pollAvailability}=require('../booking/availability.cjs');
const {getFinalPaytmStatus}=require('../payment/paytm-final-status.cjs');
const {fingerprint,phonePeHeaders,phonePeRedirect,razorpayRedirect,phonePeQr,pollPhonePe}=require('../payment/phonepe-transport.cjs');
const {definitionFingerprint}=require('./recovered-contract.cjs');
const contracts=require('../payment/recovered-contract.json');

// Development-only migration switch. The installed release retains the old
// implementation until the reconstructed path has also had service validation.
function reconstructedPayment({development=false,managedRelease=false,enabled=false,definitions,dependencies={}}={}) {
  if(!development||managedRelease||!enabled)return {};
  definitions??=require('../generated/index.cjs');
  for(const[id,expected]of Object.entries(contracts)){
    const actual=definitions[id];
    if(!actual||actual.nativeId!==expected.nativeId||definitionFingerprint(actual)!==expected.sha256)
      throw new Error('Reconstructed payment contract changed for '+id+'. Review the recovered definition and comparison tests before enabling this candidate.');
  }
  return paymentFactories(dependencies);
}

// Factory construction is independent of the experimental all-module migration.
// Production opts into only the reviewed web-booking adapters below.
function paymentFactories(dependencies={}) {
  return {
    f1717:({readBinding})=>function(input){return paytmBankResponse(this,input,{parseDelay:html=>readBinding(785,undefined,1)(html)});},
    f1689:({readBinding})=>function(mid,orderId,stopped,onWait,maxAttempts){return pollPaytmStatus(this,mid,orderId,stopped,onWait,maxAttempts,{getField:(html,name)=>readBinding(783,undefined,1)(html,name)});},
    f1693:()=>function(mid,orderId,timeoutMs,stopped){return waitForPaytmWs(this,mid,orderId,timeoutMs,stopped,{timers:dependencies.timers});},
    f1712:({readBinding})=>function(payment){return getFinalPaytmStatus(this,payment,{parseForm:html=>readBinding(775,undefined,1)(html),globals:dependencies.globals});},
    f1730:()=>function(){return fingerprint(this,{globals:dependencies.globals,random:dependencies.random});},
    f1733:()=>function(token,options){return phonePeHeaders(this,token,options);},
    f1734:({readBinding})=>function(input){return phonePeRedirect(this,input,{getAction:html=>readBinding(784,undefined,1)(html),getField:(html,name)=>readBinding(783,undefined,1)(html,name)});},
    f1736:()=>function(action,token){return phonePeQr(this,action,token);},
    f1751:()=>function(token,stopped,onWait,maxAttempts){return pollPhonePe(this,token,stopped,onWait,maxAttempts);},
    f1758:({readBinding})=>function(input){return razorpayRedirect(this,input,{getAction:html=>readBinding(784,undefined,1)(html),getField:(html,name)=>readBinding(783,undefined,1)(html,name)});},
    f150:()=>razorpayLocation,
    f1612:()=>parseRazorpayCheckoutPage,
    f1760:({readBinding})=>function(action,encdata){return razorpayCheckout(this,action,encdata,{resolveLocation:location=>readBinding(137,undefined,1)(location),parseCheckout:html=>readBinding(786,undefined,1)(html)});},
    f1764:()=>function(keyId,newSession){return razorpaySessionToken(this,keyId,newSession);},
    f151:()=>razorpayPollUrl,
    f1766:({readBinding})=>function(order){
      const slot=number=>()=>readBinding(number,undefined,1);
      return razorpayCreate(this,order,{pollUrl:(url,base)=>readBinding(138,undefined,1)(url,base),limits:{rateLimitAttempts:slot(787),errorAttempts:slot(788),rateLimitDelay:slot(789)},clock:dependencies.clock,random:dependencies.random,timers:dependencies.timers});
    },
    f1771:({readBinding})=>function(payment,stopped,onWait,interval,maxAttempts){return pollRazorpay(this,payment,stopped,onWait,interval,maxAttempts,{getField:(html,name)=>readBinding(783,undefined,1)(html,name),environment:dependencies.environment});},
    f1722:()=>function(input){return walletVerify(this,input,{clock:dependencies.dateConstructor});},
    f2046:()=>function(reason){return cancelPayment(this,reason);},
    f2047:({readBinding})=>function(){return stoppedResult(this,{defaultResult:()=>readBinding(940,undefined,1)()});},
    f2049:()=>function(){return minimizeBrowser(this);},
    f2055:({readBinding})=>function(){return focusBrowser(this,{bringToFront:page=>readBinding(123,undefined,1)(page)});},
    f2057:({readBinding})=>function(){return hideBrowser(this,{moveOffScreen:(page,hidden)=>readBinding(122,undefined,1)(page,hidden)});},
    f2063:()=>function(){return highLoadDelay(this,{random:dependencies.random});},
    f2051:({readBinding})=>function(proxy){return controlProxyContext(this,proxy,{createContext:value=>readBinding(562,undefined,1)(value)});},
    f2052:({readBinding})=>function(){return routeGatewayThroughFormProxy(this,{isFilteredCookie:name=>readBinding(247,undefined,1)(name),normalizeProxy:value=>readBinding(561,undefined,1)(value),bypass:()=>readBinding(133,undefined,1),playwright:()=>readBinding(15,undefined,1)});},
    f2059:({readBinding})=>function(){return printTicketInBrowser(this,{bringToFront:page=>readBinding(123,undefined,1)(page)});},
    f2061:()=>function(page){return dumpAuthState(this,page);},
    f2064:({readBinding})=>function(target,method,url,body,options){
      const call=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      const val=slot=>readBinding(slot,undefined,1);
      return safeCall(this,target,method,url,body,options,{
        formatPathStep:call(365),
        formatPathShape:call(368),
        maxOpt:call(364),
        ewLimit:val(581),
        highloadText:val(598),
        ipBlockedMessage:val(601),
        duplicateLoginMessage:val(602),
        terminalClosed:val(603),
        parseAkScore:readBinding(774,undefined,1)?.parseAkScore,
        hlCoverRateLimit:call(877),
        fastRetryDelay:val(922),
        hlCoverWindow:val(923),
        classifyResponse:(status,body,headers,options)=>{
          if(options?.bookingNotAllowedTerminal!==false){
            const text=call(928)(body);
            if(/booking not allowed/i.test(text))return 'terminal';
          }
          return call(930)(status,body,headers);
        },
        describeFailure:call(931),
        extractErrorText:call(928),
        onResponse:dependencies.onResponse,
        previewBody:call(939),
        random:dependencies.random,
        sleep:dependencies.timers?.sleep,
      });
    },
    f2079:({readBinding})=>function(reason,options){return stopWith(this,reason,options,{shouldRecover:(...args)=>readBinding(619,undefined,1)(...args)});},
    f2081:()=>function(patch){return updateLiveForm(this,patch);},
    f2083:({readBinding})=>function(){return ensureAuthToken(this,{bringToFront:page=>readBinding(123,undefined,1)(page),terminalClosed:()=>readBinding(603,undefined,1),terminalNoToken:()=>readBinding(604,undefined,1)});},
    f2087:({readBinding})=>function(){return relaunchIfLoggedOut(this,{loginButtonVisible:page=>readBinding(431,undefined,1)(page),positivelyLoggedIn:page=>readBinding(755,undefined,1)(page),waitForHydration:page=>readBinding(474,undefined,1)(page)});},
    f2094:({readBinding})=>function(page){return attachDuplicateLoginWatch(this,page,{isJourneyContextUrl:(url,primed)=>readBinding(635,undefined,1)(url,primed)});},
    f3149:({readBinding})=>function(job,passengers){
      const call=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      const value=(slot,name)=>()=>readBinding(slot,name,1);
      return runRailOne(this,job,passengers,{
        random:()=>(dependencies.random??Math.random)(),environment:()=>dependencies.environment??process.env,
        sensor:()=>readBinding(25,'he',0),
        validateUrl:value(1337,'MD'),searchUrl:value(1338,'yO'),boardingUrl:value(1340,'IO'),tokenUrl:value(1341,'bO'),
        primeWindowMs:value(1409,'bM'),sensorRetryMax:value(1413,'SM'),rawKeys:value(1369,'AD'),statuses:value(1404,'Je'),
        userAgent:value(1389,'QO'),billdeskClient:value(1402,'ID'),genericFailure:value(600,'iS'),
        hasSession:call(1347),validateWait:call(1345),paymentWait:call(1346),searchBody:call(1353),boardingBody:call(1358),
        journeyFilter:call(1354),parseResponse:call(405),stationList:call(417),hardError:call(1379),isFatal:call(596),
        inputTimes:call(419),passengerWait:call(1419),clientTxnId:call(1328),deviceId:call(1327),cateringCodes:call(373),
        foodChoice:call(374),bookingBody:call(1359),rawJson:call(1368),amountOf:call(1426),responseShape:call(1427),
        responsePreview:call(1429),captchaFrom:call(1430),berthPreferenceUnmet:call(415),notConfirmed:call(416),
        boardingRejected:call(1380),isAkamaiBlock:call(409),classifyAddon:call(414),failureText:call(1425),
        captchaGenerateUrl:call(1348),paymentInitUrl:call(1349),walletBody:call(1365),walletInit:call(1375),
        walletDeclined:call(1376),walletVerifyBody:call(1366),parseVerify:call(399),serverBusy:call(1411),
        validVpa:call(1417),bankList:call(1386),bankOffered:call(1385),upiAmount:call(1382),maskedVpa:call(1418),
        upiBody:call(1367),upiRawBody:call(1370),orderInfo:call(1373),verifyBody:call(1371),ordersView:call(1398),
        prefView:call(1399),transactionView:call(1400),statusView:call(1401),initRejection:call(1383),terminalBody:call(1384),
      });
    },
    f3132:({readBinding})=>function(method,url,opts){
      const call=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      const val=slot=>readBinding(slot,undefined,1);
      return callTransport(this,method,url,opts,{
        formatPathStep:call(365),
        formatPathShape:call(368),
        formatHdr:call(1428),
        formatBody:call(1429),
        ewLimit:val(581),
        highloadText:val(598),
        jeSet:val(1404),
        znSet:val(1405),
        isNotAvail:call(1411),
        isQuarantined:call(1421),
        isInvalidToken:call(1422),
        maxOpt:call(364),
      });
    },
    f2161:({readBinding})=>function(job,options){
      const call=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return runBrowserBooking(this,job,options,{
        humanFor:page=>new(readBinding(230,'Gt',1))(page),
        stopped:()=>readBinding(940,undefined,1)(),
        duplicateLogin:()=>readBinding(602,'ni',1),
        clientTxnId:call(347),slotImminent:call(632),windowLimit:()=>readBinding(631,'QT',1),shouldSearch:call(633),
        clearOverlays:call(474),spaDecision:call(634),spaWait:()=>readBinding(920,'WC',1),
        availabilityUrl:()=>readBinding(355,'Ku',1),availabilityBody:call(357),
        boardingUrl:()=>readBinding(354,'QI',1),boardingBody:call(372),
        submitUrl:()=>readBinding(358,'XI',1),bookingRequest:call(378),retryNotice:()=>readBinding(598,'Mt',1),
        parseResponse:call(405),stationList:call(417),inputTimes:call(419),cateringCodes:call(373),bankDetail:call(390),
        extractError:call(396),isAkamaiBlock:call(409),captchaChallenge:call(411),
        berthPreferenceUnmet:call(415),notConfirmed:call(416),passengerWait:call(927),
      });
    },
    f2102:({readBinding})=>function(job){return runUiBooking(this,job,{
      humanFor:page=>new(readBinding(230,'Gt',1))(page),
      stopped:()=>readBinding(940,undefined,1)(),
      duplicateLogin:()=>readBinding(602,'ni',1),
      optimizeSpace:(page,on)=>readBinding(466,undefined,1)(page,on),
      driver:()=>readBinding(666,undefined,1),
      reference:()=>readBinding(941,undefined,1)(),
    });},
    f2128:({readBinding})=>function(goal,extra){return aiResolve(this,goal,extra,{createSnapshot:page=>new(readBinding(230,undefined,1))(page)});},
    f2269:({readBinding})=>function(journey,trainNumber,quota,options){
      const call=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      const val=slot=>readBinding(slot,undefined,1);
      return pollAvailability(this,journey,trainNumber,quota,options,{
        buildBody:call(369),
        newSiteBody:call(371),
        maxOptStep:val(363),
        buildUrl:call(351),
        newSiteUrl:val(353),
        isHighLoadBody:call(403),
        isAkamaiBlockedBody:call(404),
        parseResponse:call(405),
        parseNewSiteResponse:call(408),
        isAkamaiBlock:call(409),
        slotTimeoutWindowMs:val(912),
        slowRetryDelayMs:call(915),
        pollStatusVerdict:call(916),
        highloadStatuses:val(921),
        extractErrorText:call(928),
        random:dependencies.random,
        env:dependencies.environment,
      });
    },
    f2271:()=>function(min,max){return timeHelpers.randomBetween(min,max,dependencies.random);},
    f2367:()=>function(list){return timeHelpers.pickRandom(list,dependencies.random);},
    f2368:()=>timeHelpers.pickStep,
    f2369:()=>timeHelpers.errorText,
    f2373:({readBinding})=>function(status,text){return timeHelpers.describeFailure(status,text,{messageOf:value=>readBinding(928)(value),duplicateLoginMessage:()=>readBinding(602)});},
    f2375:({readBinding})=>function(quota,classCode){return timeHelpers.quotaFamily(quota,classCode,{acClasses:()=>readBinding(933)});},
    f2376:()=>timeHelpers.parseClockTime,
    f2377:()=>timeHelpers.formatIstClock,
    f2379:()=>timeHelpers.parseServerTimestamp,
    f2380:()=>timeHelpers.istDayAt,
    f2381:()=>timeHelpers.preview,
    f2383:()=>function(){return timeHelpers.referenceNumber(dependencies.random);},
    f2385:()=>timeHelpers.maskedKey,
    f2272:()=>function(){return serverTime.serverNow(this);},
    f2274:({readBinding})=>function(stamp,t0,t1,label){return serverTime.applyServerTimeStamp(this,stamp,t0,t1,label,{parseStamp:value=>readBinding(937,undefined,1)(value),formatClock:value=>readBinding(936,undefined,1)(value)});},
    f2276:({readBinding})=>function(){return serverTime.syncServerTime(this,{basePath:()=>readBinding(345,'rt',1)});},
    f2278:({readBinding})=>function(){return serverTime.ensureServerTimeSynced(this,{basePath:()=>readBinding(345,'rt',1),formatClock:value=>readBinding(936,undefined,1)(value)});},
    f2255:()=>providerPage.providerOriginOk,
    f2256:({readBinding})=>function(){return providerPage.onProviderPage(this,{originCheck:url=>readBinding(51,undefined,0).providerOriginOk(url)});},
    f2257:()=>function(action){return providerPage.ensureOnProviderPage(this,action);},
    f425:()=>rules.proxySettings,
    f426:()=>rules.proxyLabel,
    f427:()=>rules.isSeniorCitizen,
    f428:({readBinding})=>function(passenger){return rules.countsAsLowerBerth(passenger,{isSenior:(gender,age)=>readBinding(268)(gender,age)});},
    f429:({readBinding})=>function(passengers){return rules.countLowerBerths(passengers,{counts:passenger=>readBinding(269)(passenger)});},
    f431:({readBinding})=>function(passengers){return rules.lowerBerthWarning(passengers,{countLower:list=>readBinding(270)(list),limit:()=>readBinding(267)});},
    f432:()=>require('../booking/time-helpers.cjs').parseClockTime,
    f433:({readBinding})=>function(stored){return rules.openingTimes(stored,{parse:value=>readBinding(273)(value),defaults:()=>readBinding(272)});},
    f435:()=>rules.withAvailabilityEpoch,
    f436:()=>rules.storedAvailabilityTime,
    f437:({readBinding})=>function(flag,minuteOfDay){return rules.beforeCutoff(flag,minuteOfDay,{cutoff:()=>readBinding(278)});},
    f438:({readBinding})=>function(stored,current,family,special){return rules.availabilityTime(stored,current,family,special,{parse:value=>readBinding(273)(value),lookup:(a,b,c)=>readBinding(277)(a,b,c)});},
    f439:()=>rules.joinLabel,
    f440:({readBinding})=>function(list){return rules.listIncludes(list,readBinding(283));},
    f441:({readBinding})=>function(config,list){return rules.railBrahmosKind(config,list,{includes:value=>readBinding(286)(value)});},
    f444:({readBinding})=>function(options){return rules.loginMode(options,{brahmosMode:()=>readBinding(283)});},
    f445:({readBinding})=>function(mode){return rules.loginFlags(mode,{brahmosMode:()=>readBinding(283)});},
    f446:({readBinding})=>function(mode,list){return rules.allowedMode(mode,list,{defaults:()=>readBinding(282)});},
    f447:({readBinding})=>function(mode,config,args){return rules.modeDispatch(mode,config,args,{railKind:(a,b)=>readBinding(287)(a,b),loginModeOf:value=>readBinding(289)(value),allowedModeOf:(mode,list)=>readBinding(291)(mode,list)});},
    f448:()=>rules.proxyFromConfig,
    f449:()=>rules.isPlainObject,
    f450:()=>rules.stringOr,
    f451:()=>rules.memberOr,
    f452:()=>rules.positiveAmount,
    f453:()=>rules.passengerCount,
    f454:({readBinding})=>function(quota,classCode){return rules.quotaFamilyCaseless(quota,classCode,{acClasses:()=>readBinding(302)});},
    f455:({readBinding})=>function(quota,classCode,now){return rules.bookingWindow(quota,classCode,now,{family:(a,b)=>readBinding(304)(a,b),openingTimes:()=>readBinding(303)});},
    f456:({readBinding})=>function(number,name){return rules.isPremiumTrain(number,name,{premiumNumbers:()=>readBinding(306)});},
    f1704:()=>function(){return paytmOriginPage(this,dependencies.globals);},
    f1708:()=>function(path,options){return paytmPageRequest(this,path,options);},
    f1710:()=>function(){return disposePaytmPage(this);},
    f1601:()=>function(html){return paytmAppData(html,dependencies.globals);},
    f1605:()=>paytmQrImage,
    f1606:()=>function(url){return paytmOrderFromUrl(url,dependencies.globals);},
    f1607:()=>function(data,url){return paytmOrderFromData(data,url,dependencies.globals);},
    f1687:({readBinding})=>function(input){
      const root=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return fetchPaytmQr(this,input,{parseData:root(776),extractImage:root(779),orderFromUrl:root(780),orderFromData:root(781),globals:dependencies.globals});
    },
    f1649:()=>function(method,url,options,response,error){return recordHttp(this,method,url,options,response,error,{clock:dependencies.clock});},
    f1633:({readBinding})=>function(method,url,options){
      const root=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return sendViaWebTlsGateway(this,method,url,options,{cookieHeader:root(764),filterCookieHeader:root(250),filterSetCookies:root(252),applySetCookies:root(768)});
    },
    f1652:({readBinding})=>function(){
      const root=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return gatewayRequest(this,{prepareCookies:root(468),isTlsHost:root(790),isBrowserClosed:root(139),isProxyNetworkError:root(136),canFallbackRequest:root(135),getConfig:()=>readBinding(18,'xw')});
    },
    f1617:()=>function(request){return useProxiedRequest(this,request);},
    f1618:()=>function(proxy){return useSurvivorProxy(this,proxy);},
    f1619:({readBinding})=>function(){return armSurvivor(this,{getRequest:()=>readBinding(15,undefined,1).request,isFilteredCookie:name=>readBinding(247,undefined,1)(name)});},
    f1624:()=>function(active,onFallback){return setProxyFallback(this,active,onFallback);},
    f1625:({readBinding})=>function(){return ensureDirectContext(this,{getRequest:()=>readBinding(15,undefined,1).request,isFilteredCookie:name=>readBinding(247,undefined,1)(name)});},
    f1628:()=>function(ms){return sleep(ms,dependencies.timers);},
    f1611:()=>interstitialDelay,
    f1681:({readBinding})=>function(payload,responseKey){return bankResponse(this,payload,responseKey,{isBrowserClosed:error=>readBinding(139,undefined,1)(error),parseDelay:html=>readBinding(785,undefined,1)(html)});},
    f1603:()=>commandStatus,
    f1678:({readBinding})=>function(qr){return fetchProviderEncdata(this,qr,{parseConfig:html=>readBinding(777,undefined,1)(html)});},
    f1673:({readBinding})=>function(qr,stopped,onWait,maxAttempts,interval,sleep){return pollProviderQr(this,qr,stopped,onWait,maxAttempts,interval,sleep,{parseConfig:html=>readBinding(777,undefined,1)(html),classify:body=>readBinding(778,undefined,1)(body),clock:dependencies.clock});},
    f1602:()=>function(html){return appConfig(html,dependencies.globals);},
    f1608:()=>qrAmount,
    f1668:({readBinding})=>function(action,encdata){return createProviderQr(this,action,encdata,{parseConfig:html=>readBinding(777,undefined,1)(html),parseAmount:payload=>readBinding(782,undefined,1)(payload)});},
    f1684:({readBinding})=>function(input){return paytmRedirect(this,input,{parseForm:html=>readBinding(775,undefined,1)(html)});},
    f1599:({readBinding})=>function(html){return paytmRedirectForm(html,{getAction:value=>readBinding(784)(value),getField:(value,name)=>readBinding(783)(value,name)});},
    f1609:()=>hiddenFormValue,
    f1610:()=>formAction,
    f1667:({readBinding})=>function(input){return paymentRedirect(this,input,{getAction:html=>readBinding(784,undefined,1)(html),getField:(html,name)=>readBinding(783,undefined,1)(html,name)});},
    f1621:()=>function(){return disposeSurvivor(this);},
    f1630:()=>function(){return disposeDirectContext(this);},
    f1659:()=>function(){return liveProviderOrigin(this);},
    f1660:()=>function(){return clientHints(this);},
    f1662:()=>function(){return gatewayHints(this);},
    f1663:()=>function(url){return setGatewayPageOrigin(this,url);},
    f1664:()=>function(){return gatewayPageReferrer(this);},
    f1665:()=>function(host){return originFor(this,host);},
    f152:()=>isBrowserClosedError,
    f1666:()=>function(host,options){return gatewayHeaders(this,host,options);},
    f1756:({readBinding})=>function(label,operation,maxAttempts,stopRetry){return retryGatewayRequest(this,label,operation,maxAttempts,stopRetry,{isBrowserClosed:error=>readBinding(139,undefined,1)(error),timers:dependencies.timers});},
    f1719:()=>function(input){return requestBookingData(this,input);},
    f1727:()=>function(input){return requestPrintTicket(this,input);},
    f2230:()=>function(){return sessionTokens(this);},
    f2231:()=>function(){return paymentPageReferrer(this);},
    f2232:()=>function(){return paymentRequestId(this,dependencies);},
    f2243:()=>function(booking){return finishBooking(this,booking);},
    f2233:()=>function(booking){return finishBookingCore(this,booking,dependencies);},
    f2247:()=>function(booking){return attachPrintTicket(this,booking);},
    f510:({readBinding})=>function(transactionId,insuranceApplicable){
      return bookingPaymentUrl(readBinding(345,'rt'),transactionId,insuranceApplicable);
    },
    f535:({readBinding})=>function(method,amount,bankOverride){
      return bookingPaymentBody(method,amount,bankOverride,key=>readBinding(386)(key));
    },
    f545:()=>isBankProcessingError,
    f554:()=>emptyBooking,
    f547:({readBinding})=>function(transactionId){return bookingDataUrl(readBinding(345,'rt'),transactionId);},
    f548:()=>bookingRetryDelay,
    f549:({readBinding})=>function(response){
      return normalizeBooking(response,{extractError:value=>readBinding(396)(value),empty:()=>readBinding(400)()});
    },
    f2220:()=>function(){return canRequestPnr(this);},
    f2221:()=>function(ms){return waitForPnrRetry(this,ms,dependencies.timers);},
    f2226:({readBinding})=>function(transactionId,journey,maxAttempts){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return pollBookingData(this,transactionId,journey,maxAttempts,{bookingDataUrl:binding(397),retryAfter:binding(398),normalizeBooking:binding(399)},dependencies);
    },
    f2172:({readBinding})=>function(journey,transactionId,amount,excluded){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return initializePayment(this,journey,transactionId,amount,excluded,{
        getCandidates:binding(394),chooseBank:binding(393),buildPaymentBody:binding(387),
        buildPaymentUrl:binding(362),isBankError:binding(395),extractError:binding(396),stoppedResult:binding(940),
      },dependencies);
    },
    f546:()=>paymentResponseError,
    f2181:({readBinding})=>function(payment,responseKey,transactionId,journey,requireBankResponse){
      return settlePayment(this,payment,responseKey,transactionId,journey,requireBankResponse,{normalizeProxy:value=>readBinding(561,undefined,1)(value)});
    },
    f2176:({readBinding})=>function(journey,transactionId,amount,method,initResponse){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return dispatchPayment(this,journey,transactionId,amount,method,initResponse,{
        extractError:binding(396),normalizeBooking:binding(399),stoppedResult:binding(940),
      });
    },
    f542:({readBinding})=>function(table,method){
      return choosePaymentBank(table,method,{getIds:()=>readBinding(388,'cT'),defaultBankId:key=>readBinding(386)(key),hasBank:(data,id)=>readBinding(391)(data,id)});
    },
    f544:({readBinding})=>function(selected,table){
      return paymentCandidates(selected,table,{getOrder:()=>readBinding(389,'Zu'),isAvailable:(data,key)=>readBinding(392)(data,key)});
    },
    f2186:()=>function(journey,transactionId,amount){return runProviderQr(this,journey,transactionId,amount,dependencies);},
    f2193:()=>function(journey,transactionId,amount){return runPaytm(this,journey,transactionId,amount,dependencies);},
    f2208:()=>function(journey,transactionId,amount){return runPhonePe(this,journey,transactionId,amount,dependencies);},
    f2213:()=>function(journey,transactionId,amount,flow){return runRazorpay(this,journey,transactionId,amount,flow,dependencies);},
    f2196:({readBinding})=>function(resolve){
      return startPaytmWatch(resolve,readBinding(2),readBinding(4),readBinding(5),readBinding(6));
    },
  };
}
const WEB_UPGRADE_IDS=Object.freeze(['f2064','f2161','f2269','f2052','f2172','f1652']);
function webBookingUpgrades({dependencies={}}={}) {
  const factories=paymentFactories(dependencies);
  return Object.fromEntries(WEB_UPGRADE_IDS.map(id=>[id,factories[id]]));
}
module.exports={reconstructedPayment,webBookingUpgrades,WEB_UPGRADE_IDS};
