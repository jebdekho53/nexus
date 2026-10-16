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
const {cancelPayment,stoppedResult,highLoadDelay,focusBrowser,hideBrowser,minimizeBrowser}=require('../booking/controls.cjs');
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
module.exports={reconstructedPayment};
