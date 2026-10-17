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
const {getFinalPaytmStatus}=require('../payment/paytm-final-status.cjs');
const {fingerprint,phonePeHeaders,phonePeRedirect,razorpayRedirect,phonePeQr,pollPhonePe}=require('../payment/phonepe-transport.cjs');
const formsVault=require('../storage/forms-vault.cjs');
const recordVault=require('../storage/record-vault.cjs');
const historyVault=require('../storage/history-vault.cjs');
const windowIpc=require('../windows/window-ipc.cjs');
const windowHelpers=require('../windows/window-helpers.cjs');
const browserIpc=require('../ipc/browser-ipc.cjs');
const logsIpc=require('../ipc/logs-ipc.cjs');
const dataIpc=require('../ipc/data-ipc.cjs');
const settingsIpc=require('../ipc/settings-ipc.cjs');
const transferIpc=require('../ipc/transfer-ipc.cjs');
const formsTransferIpc=require('../ipc/forms-transfer-ipc.cjs');
const formCodecs=require('../storage/form-codecs.cjs');
const formsCsv=require('../storage/forms-csv.cjs');
const formNormalization=require('../storage/form-normalization.cjs');
const recordCodecs=require('../storage/record-codecs.cjs');
const backupIpc=require('../ipc/backup-ipc.cjs');
const settingsStore=require('../storage/settings-store.cjs');
const {definitionFingerprint}=require('./recovered-contract.cjs');
const contracts=require('../payment/recovered-contract.json');

// Saved-forms vault (class constructed by f862): every accessor reads its bootstrap slot at call time.
function formsVaultDependencies(readBinding,dependencies) {
  const slot=number=>()=>readBinding(number,undefined,1);
  return {
    fs:slot(18),encrypt:slot(537),decrypt:slot(538),normalizeForm:slot(546),summarize:slot(548),timing:slot(276),label:slot(281),
    randomUuid:()=>readBinding(23,undefined,1).randomUUID(),
    now:()=>(dependencies.now??(()=>Date.now()))(),
  };
}

// Record vaults (saved logins, proxies, payments, booking history). The recovered classes share readVault/readAll/
// readForWrite/writeAll and differ in the collection name and the locked-error text; the saved-logins vault has no get,
// and history has its own list/add/import/delete/deleteAll/prune (history-vault.ts).
const RECORD_VAULTS={
  users:{collection:'users',list:'f900',save:'f902',saveMany:'f903',delete:'f906',deleteAll:'f908',readVault:'f909',locked:'f910',readAll:'f911',readForWrite:'f912',writeAll:'f913'},
  proxies:{collection:'proxies',list:'f916',get:'f918',save:'f920',saveMany:'f921',delete:'f924',deleteAll:'f926',readVault:'f927',locked:'f928',readAll:'f929',readForWrite:'f930',writeAll:'f931'},
  payments:{collection:'payments',list:'f934',get:'f936',save:'f938',saveMany:'f939',delete:'f942',deleteAll:'f944',readVault:'f945',locked:'f946',readAll:'f947',readForWrite:'f948',writeAll:'f949'},
  history:{collection:'entries',readVault:'f964',readAll:'f965',readForWrite:'f966',writeAll:'f967'},
};
function recordVaultDependencies(collection,readBinding,dependencies) {
  const slot=number=>()=>readBinding(number,undefined,1);
  return {collection,lockedMessage:recordVault.LOCKED_MESSAGES[collection],fs:slot(18),encrypt:slot(537),decrypt:slot(538),now:()=>(dependencies.now??(()=>Date.now()))()};
}
function recordVaultFactories(dependencies) {
  const factories={};
  for(const ids of Object.values(RECORD_VAULTS)) {
    const deps=readBinding=>recordVaultDependencies(ids.collection,readBinding,dependencies);
    factories[ids.readVault]=({readBinding})=>function(){return recordVault.readVault(this,deps(readBinding));};
    factories[ids.readAll]=({readBinding})=>function(){return recordVault.readAll(this,deps(readBinding));};
    factories[ids.readForWrite]=({readBinding})=>function(){return recordVault.readForWrite(this,deps(readBinding));};
    factories[ids.writeAll]=({readBinding})=>function(records){return recordVault.writeAll(this,records,deps(readBinding));};
    if(ids.locked)factories[ids.locked]=()=>function(){return recordVault.locked(this);};
    if(ids.list&&ids.collection!=='entries')factories[ids.list]=()=>function(){return recordVault.list(this);};
    if(ids.get)factories[ids.get]=()=>function(id){return recordVault.get(this,id);};
    if(ids.save)factories[ids.save]=()=>function(record){return recordVault.save(this,record);};
    if(ids.saveMany)factories[ids.saveMany]=({readBinding})=>function(records){return recordVault.saveMany(this,records,deps(readBinding));};
    if(ids.delete&&ids.collection!=='entries')factories[ids.delete]=()=>function(id){return recordVault.remove(this,id);};
    if(ids.deleteAll&&ids.collection!=='entries')factories[ids.deleteAll]=()=>function(){return recordVault.deleteAll(this);};
  }
  return factories;
}
// Booking-history specifics (class constructed by f950). Retention settings are bootstrap slots read when pruning.
function historyVaultFactories(dependencies) {
  return {
    f952:()=>function(){return historyVault.list(this);},
    f954:()=>function(entry){return historyVault.add(this,entry);},
    f955:()=>function(entries){return historyVault.importEntries(this,entries);},
    f957:()=>function(id){return historyVault.remove(this,id);},
    f959:()=>function(){return historyVault.deleteAll(this);},
    f961:({readBinding})=>function(entries){
      return historyVault.prune(entries,{maxAgeMs:()=>readBinding(553,'k0',1),maxEntries:()=>readBinding(552,'bA',1),now:()=>(dependencies.now??(()=>Date.now()))()});
    },
  };
}

// Window-management IPC handlers (registered by f4272). Bootstrap helpers are read at call time; their names are inferred
// from how the recovered handlers use them (see window-ipc.ts). The handlers receive the IPC event first.
function windowIpcDependencies(readBinding,dependencies) {
  const slot=(number,name)=>()=>readBinding(number,name,1);
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  return {
    electron:slot(22,'x'),fs:slot(18,'y'),path:slot(14,'m'),os:slot(13,'ce'),
    securityCheck:call(1247),securityState:call(1690),allowedControllerActions:slot(253,'Hy'),controllerUnlocked:call(2104),
    openNewForm:call(2060),focusFormWindow:call(2062),openFormWindow:call(2059),openUtilityWindow:call(2070),
    checkForUpdate:call(2110),downloadUpdate:call(2106),installUpdate:call(2123),
    updateWindow:slot(2115,'Ve'),isUpdateDownloading:call(2118),channels:slot(336,'v'),
    canOpenBookingBox:call(2105),bookingBoxBlocked:call(2065),openBookingBox:call(2068),noteBlockedBookingBox:call(2067),
    blockedBookingBoxMessage:slot(331,'Vu'),validatePassengers:call(271),stageTransientForm:call(1540),
    isSizeLocked:call(1942),reportSizeLocked:call(1945),centredWindows:slot(2036,'_l'),bottomMargin:slot(2026,'pu'),edgeMargin:slot(2027,'Cn'),
    controllerWindow:slot(2039,'tt'),controllerSize:call(2031),expandedWidth:slot(2029,'nB'),expandedHeight:slot(2030,'rB'),
    trackedWindows:slot(2063,'Ln'),enlargeQr:call(1929),checkPaymentNow:call(1930),renderTicketHtml:call(1911),saveTicketPdf:call(205),
    requestQuit:call(2055),confirmQuit:call(2131),
    platform:()=>(dependencies.platform??(()=>process.platform))(),
    setTimer:(callback,ms)=>(dependencies.setTimeout??setTimeout)(callback,ms),
  };
}
function windowIpcFactories(dependencies) {
  const deps=readBinding=>windowIpcDependencies(readBinding,dependencies);
  return {
    f4273:({readBinding})=>async function(event,action){return windowIpc.controllerAction(deps(readBinding),action);},
    f4274:({readBinding})=>async function(){return windowIpc.checkUpdateNow(deps(readBinding));},
    f4275:({readBinding})=>async function(event,asset){return windowIpc.downloadUpdate(deps(readBinding),event,asset);},
    f4277:({readBinding})=>function(event){return windowIpc.cancelUpdateDownload(deps(readBinding),event);},
    f4278:({readBinding})=>async function(event,options){return windowIpc.openFormWindow(deps(readBinding),options);},
    f4279:({readBinding})=>async function(event,id){return windowIpc.openBookingBox(deps(readBinding),id);},
    f4280:({readBinding})=>async function(event,form){return windowIpc.openBookingBoxTransient(deps(readBinding),form);},
    f4281:({readBinding})=>async function(event,width,height,options){return windowIpc.resizeSelf(deps(readBinding),event,width,height,options);},
    f4282:({readBinding})=>function(event){return windowIpc.repaintSelf(deps(readBinding),event);},
    f4284:({readBinding})=>async function(event,arg){return windowIpc.enlargeQr(deps(readBinding),arg);},
    f4285:({readBinding})=>async function(event,arg){return windowIpc.checkNowPayment(deps(readBinding),arg);},
    f4286:({readBinding})=>async function(event,expanded){return windowIpc.controllerMinimize(deps(readBinding),event,expanded);},
    f4287:({readBinding})=>async function(event,link){return windowIpc.openExternal(deps(readBinding),link);},
    f4288:({readBinding})=>async function(ticket){return windowIpc.renderTicketPdf(deps(readBinding),ticket);},
    f4291:({readBinding})=>async function(event,ticket){return windowIpc.printTicket(deps(readBinding),ticket);},
    f4292:({readBinding})=>async function(event){return windowIpc.closeAuxWindows(deps(readBinding),event);},
    f4293:({readBinding})=>async function(){return windowIpc.requestQuit(deps(readBinding));},
    f4294:({readBinding})=>async function(){return windowIpc.confirmQuit(deps(readBinding),false);},
    f4295:({readBinding})=>async function(){return windowIpc.confirmQuit(deps(readBinding),true);},
  };
}

// Browser, log and success-ticket IPC handlers (registered by f3790). The handlers were created in f3790's scope, so its
// settings object is context slot 3 at depth 0 and the bootstrap slots are at depth 1.
function browserIpcDependencies(readBinding,writeBinding,dependencies) {
  const slot=(number,name)=>()=>readBinding(number,name,1);
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  return {
    environment:()=>readBinding(3,undefined,0),detectBrowsers:call(107),profileServiceReady:call(1786),summarizeBrowsers:call(102),log:call(1885),
    findBrowserDownload:call(65),openExternal:url=>readBinding(22,'x',1).shell.openExternal(url),
    brahmosBusy:slot(1965,'rc'),setBrahmosBusy:busy=>writeBinding(1965,busy,1),installBrahmos:call(176),sanitizeMessage:slot(170),
    channels:slot(336,'v'),downloadCatalog:call(68),now:()=>(dependencies.now??(()=>Date.now()))(),
  };
}
function logsIpcDependencies(readBinding,dependencies) {
  const slot=(number,name)=>()=>readBinding(number,name,1);
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  return {
    appLog:slot(1867,'bn'),fullLog:slot(1869,'un'),preferPlainLog:call(1881),logPairs:call(1866),config:call(61),encryptLog:call(595),afterExport:call(1886),
    fs:slot(18,'y'),path:slot(14,'m'),windowFor:sender=>readBinding(22,'x',1).BrowserWindow.fromWebContents(sender),
    showSaveDialog:(parent,options)=>readBinding(22,undefined,1).dialog.showSaveDialog(parent,options),
    showSaveDialogWithoutParent:options=>readBinding(22,undefined,1).dialog.showSaveDialog(options),
    successTickets:slot(1940,'la'),showSuccessTicket:call(1947),
    platform:()=>(dependencies.platform??(()=>process.platform))(),pid:()=>(dependencies.pid??(()=>process.pid))(),
    now:()=>new(dependencies.dateConstructor??Date)(),
  };
}
function ordinaryIpcFactories(dependencies) {
  const browser=(readBinding,writeBinding)=>browserIpcDependencies(readBinding,writeBinding,dependencies);
  const logs=readBinding=>logsIpcDependencies(readBinding,dependencies);
  return {
    f3817:({readBinding,writeBinding})=>async function(){return browserIpc.detectBrowsers(browser(readBinding,writeBinding));},
    f3818:({readBinding,writeBinding})=>async function(event,id){return browserIpc.openBrowserDownload(browser(readBinding,writeBinding),id);},
    f3819:({readBinding,writeBinding})=>async function(event){return browserIpc.downloadBrahmos(browser(readBinding,writeBinding),event);},
    f3825:({readBinding,writeBinding})=>async function(){return browserIpc.getBrowserDownloads(browser(readBinding,writeBinding));},
    f3831:({readBinding})=>async function(){return logsIpc.getLogs(logs(readBinding));},
    f3832:({readBinding})=>async function(){return logsIpc.getLogPairs(logs(readBinding));},
    f3861:({readBinding})=>function(event,key,value){return logsIpc.openSuccessTicket(logs(readBinding),key,value);},
    f3862:({readBinding})=>function(event,key){return logsIpc.getSuccessTicket(logs(readBinding),key);},
    f3863:({readBinding})=>async function(event,formIds){return logsIpc.exportLogs(logs(readBinding),event,formIds);},
  };
}

// Saved-data IPC handlers (forms, history, logins, payments, proxies; registered by f3790).
function dataIpcDependencies(readBinding,dependencies) {
  const slot=(number,name)=>()=>readBinding(number,name,1);
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  return {
    formsVault:call(1712),armedForms:slot(1539,'wt'),armedIds:call(1835),runWrite:write=>readBinding(1813,undefined,1)(write),
    afterFormSaved:call(1801),formsChanged:call(1720),
    normalizeTiming:timing=>readBinding(276,undefined,1)(timing,readBinding(1611,'ns',1)),
    lockedVaults:call(1809),recoverVaults:call(1810),usersVault:call(1789),afterUserSaved:call(1800),usersChanged:call(1721),
    historyVault:call(1792),forgetPnr:call(1793),paymentsVault:call(1796),normalizePayment:call(261),
    paymentsChanged:()=>readBinding(11,'_0x3a61fa',0)(),
    proxiesVault:call(1798),proxyTags:call(1734),runSpeedTest:call(576),proxyAddress:call(265),proxyLabel:call(266),
    relaunch:()=>readBinding(22,'x',1).app.relaunch(),exit:code=>readBinding(22,'x',1).app.exit(code),
    setTimer:(callback,ms)=>(dependencies.setTimeout??setTimeout)(callback,ms),
    windows:()=>readBinding(22,'x',1).BrowserWindow.getAllWindows(),channels:slot(336,'v'),
  };
}
function dataIpcFactories(dependencies) {
  const deps=readBinding=>dataIpcDependencies(readBinding,dependencies);
  const handler=(call)=>({readBinding})=>async function(event,argument){return call(deps(readBinding),argument);};
  return {
    f3938:handler(dataIpc.listForms),f3936:handler(dataIpc.saveForm),f3943:handler(dataIpc.getForm),f3944:handler(dataIpc.deleteForm),
    f3945:handler(dataIpc.deleteAllForms),f3946:handler(dataIpc.duplicateForm),f3947:handler(dataIpc.reorderForms),
    f3940:handler(dataIpc.getVaultLockState),f3941:handler(dataIpc.recoverVaults),
    f3960:handler(dataIpc.listHistory),f3961:handler(dataIpc.deleteHistoryEntry),f3962:handler(dataIpc.clearHistory),
    f3959:handler(dataIpc.listUsers),f3963:handler(dataIpc.saveUser),f3965:handler(dataIpc.deleteUser),f3966:handler(dataIpc.deleteAllUsers),
    f3972:({readBinding})=>function(){return dataIpc.broadcastPaymentsChanged(deps(readBinding));},
    f3973:handler(dataIpc.listPayments),f3974:handler(dataIpc.savePayment),f3976:handler(dataIpc.deletePayment),f3977:handler(dataIpc.deleteAllPayments),
    f3978:handler(dataIpc.listProxies),f3979:({readBinding})=>function(){return dataIpc.getProxyTags(deps(readBinding));},
    f3980:handler(dataIpc.runSpeedTest),f3982:handler(dataIpc.saveProxy),f3984:handler(dataIpc.deleteProxy),f3985:handler(dataIpc.deleteAllProxies),
  };
}

// Application-settings IPC handlers (registered by f3790).
function settingsIpcDependencies(readBinding) {
  const slot=(number,name)=>()=>readBinding(number,name,1);
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  return {
    readSettings:call(1768),writeSettings:call(1769),windowPinned:call(1770),applyWindowPin:call(1771),
    windows:()=>readBinding(22,'x',1).BrowserWindow.getAllWindows(),channels:slot(336,'v'),
    aiKeyConfigured:call(1784),environment:()=>readBinding(3,undefined,0),qrPopupEnabled:call(1925),newThemeEnabled:call(1623),
  };
}
function settingsIpcFactories() {
  const handler=call=>({readBinding})=>async function(event,argument){return call(settingsIpcDependencies(readBinding),argument);};
  return {
    f4013:handler(settingsIpc.getAutoUpdate),f4014:handler(settingsIpc.setAutoUpdate),f4015:handler(settingsIpc.getWindowPin),
    f4016:handler(settingsIpc.setWindowPin),f4017:handler(settingsIpc.getAiEnabled),f4018:handler(settingsIpc.setAiEnabled),
    f4019:handler(settingsIpc.getQrPopup),f4020:handler(settingsIpc.getNewTheme),f4021:handler(settingsIpc.setQrPopup),
  };
}

// Import and export of saved logins and proxies (registered by f3790).
function transferIpcDependencies(readBinding,dependencies) {
  const call=number=>(...args)=>readBinding(number,undefined,1)(...args);
  const dialog=()=>readBinding(22,undefined,1).dialog;
  return {
    windowFor:sender=>readBinding(22,'x',1).BrowserWindow.fromWebContents(sender),
    showSaveDialog:(parent,options)=>dialog().showSaveDialog(parent,options),showSaveDialogWithoutParent:options=>dialog().showSaveDialog(options),
    showOpenDialog:(parent,options)=>dialog().showOpenDialog(parent,options),showOpenDialogWithoutParent:options=>dialog().showOpenDialog(options),
    fs:()=>readBinding(18,'y',1),usersVault:call(1789),usersChanged:call(1721),parseUsers:call(1794),formatUser:()=>readBinding(255,undefined,1),
    proxiesVault:call(1798),formatProxy:call(262),parseProxy:call(263),isPrivateHost:call(1464),proxyFromLine:()=>readBinding(264,undefined,1),
    randomUuid:()=>readBinding(23,'j',1).randomUUID(),now:()=>(dependencies.now??(()=>Date.now()))(),
  };
}
function transferIpcFactories(dependencies) {
  const handler=call=>({readBinding})=>async function(event,argument){return call(transferIpcDependencies(readBinding,dependencies),event,argument);};
  const withoutEvent=call=>({readBinding})=>async function(event,argument){return call(transferIpcDependencies(readBinding,dependencies),argument);};
  return {
    f3967:handler(transferIpc.exportUsers),f3969:handler(transferIpc.importUsers),f3970:handler(transferIpc.importUserFile),f3971:withoutEvent(transferIpc.importUsersData),
    f3986:handler(transferIpc.exportProxies),f3989:handler(transferIpc.importProxies),f3991:withoutEvent(transferIpc.importProxyPaste),f3993:handler(transferIpc.importProxyFile),
  };
}

// Window and booking-panel helpers (root functions created in the bootstrap scope: bindings are read at depth 0).
function windowHelperDependencies(readBinding,writeBinding) {
  const slot=(number,name)=>()=>readBinding(number,name);
  return {
    qrStore:slot(1928,'uu'),defaultFormId:slot(1922,'Xi'),showQr:(...args)=>readBinding(1932)(...args),bookings:slot(1537,'oe'),
    windowRegistry:slot(2063,'Ln'),updateDownload:slot(2116,'Bi'),updateInstalling:slot(2113,'cs'),allWindows:()=>readBinding(22,'x').BrowserWindow.getAllWindows(),
    updateWindow:slot(2115,'Ve'),
    rememberUpdateProgress:progress=>{readBinding(2117,'yo');writeBinding(2117,progress);},
    channels:slot(336,'v'),
  };
}
function windowHelperFactories() {
  const deps=({readBinding,writeBinding})=>windowHelperDependencies(readBinding,writeBinding);
  return {
    f3738:reader=>function(formId){return windowHelpers.showStoredQr(deps(reader),formId);},
    f3739:reader=>function(formId){return windowHelpers.checkNow(deps(reader),formId);},
    f4136:reader=>function(){return windowHelpers.countLiveWindows(deps(reader));},
    f4254:reader=>function(){return windowHelpers.cancelActiveUpdateDownload(deps(reader));},
    f4261:reader=>function(except){return windowHelpers.hideOtherWindows(deps(reader),except);},
    f4262:reader=>function(window,progress){return windowHelpers.publishUpdateProgress(deps(reader),window,progress);},
  };
}

// Development-only migration switch. The installed release retains the old
function backupIpcFactories(dependencies) {
  const deps=read=>({
    forms:()=>read(1712,undefined,1)(),users:()=>read(1789,undefined,1)(),proxies:()=>read(1798,undefined,1)(),payments:()=>read(1796,undefined,1)(),history:()=>read(1792,undefined,1)(),
    token:()=>read(1786,undefined,1)(),setToken:value=>read(1785,undefined,1)(value),aadhaar:()=>read(1761,undefined,1)(),aadhaarPath:()=>read(1760,undefined,1)(),
    lock:()=>read(1773,undefined,1)(),restoreLock:value=>read(1775,undefined,1)(value),seal:(...args)=>read(962,undefined,1)(...args),unseal:(...args)=>read(963,undefined,1)(...args),
    fs:()=>read(18,'y',1),userDataPath:()=>read(22,'x',1).app.getPath('userData'),windowFor:sender=>read(22,'x',1).BrowserWindow.fromWebContents(sender),
    saveDialog:(parent,options)=>read(22,'x',1).dialog.showSaveDialog(parent,options),saveDialogWithoutParent:options=>read(22,'x',1).dialog.showSaveDialog(options),
    openDialog:(parent,options)=>read(22,'x',1).dialog.showOpenDialog(parent,options),openDialogWithoutParent:options=>read(22,'x',1).dialog.showOpenDialog(options),
    normalizeUser:(...args)=>read(257,undefined,1)(...args),normalizeProxy:(...args)=>read(264,undefined,1)(...args),normalizePayment:value=>read(261,undefined,1)(value),
    uuid:()=>read(23,'j',1).randomUUID(),now:()=>(dependencies.now??(()=>Date.now()))(),isoNow:()=>new (dependencies.dateConstructor??Date)().toISOString(),
  });
  return {f4031:({readBinding})=>async function(){return backupIpc.getBackupInfo(deps(readBinding));},
    f4032:({readBinding})=>async function(event,password,selection){return backupIpc.backupData(deps(readBinding),event,password,selection);},
    f4033:({readBinding})=>async function(event,password){return backupIpc.restoreData(deps(readBinding),event,password);}};
}

function formsTransferFactories(dependencies) {
  const deps=read=>({
    windowFor:sender=>read(22,'x',1).BrowserWindow.fromWebContents(sender),
    saveDialog:(parent,options)=>read(22,'x',1).dialog.showSaveDialog(parent,options),
    saveDialogWithoutParent:options=>read(22,'x',1).dialog.showSaveDialog(options),
    openDialog:(parent,options)=>read(22,'x',1).dialog.showOpenDialog(parent,options),
    openDialogWithoutParent:options=>read(22,'x',1).dialog.showOpenDialog(options),
    fs:()=>read(18,'y',1),basename:file=>read(14,'m',1).basename(file),
    formsVault:()=>read(1712,undefined,1)(),parseForms:(...args)=>read(325,undefined,1)(...args),
    normalize:(...args)=>read(320,undefined,1)(...args),serialize:model=>read(326,undefined,1)(model),
    changed:()=>read(1720,undefined,1)(),uuid:()=>read(23,'j',1).randomUUID(),now:()=>(dependencies.now??(()=>Date.now()))(),
  });
  const handler=call=>({readBinding})=>async function(event,arg){return call(deps(readBinding),event,arg);};
  return {f3949:handler(formsTransferIpc.exportForm),f3950:handler(formsTransferIpc.importForms),
    f3951:({readBinding})=>async function(event,items){return formsTransferIpc.importFormsData(deps(readBinding),items);},
    f3952:handler(formsTransferIpc.exportFormModel),f3953:handler(formsTransferIpc.importFormFile)};
}

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
    f2051:({readBinding})=>function(proxy){return controlProxyContext(this,proxy,{createContext:value=>readBinding(562,undefined,1)(value)});},
    f2052:({readBinding})=>function(){return routeGatewayThroughFormProxy(this,{isFilteredCookie:name=>readBinding(247,undefined,1)(name),normalizeProxy:value=>readBinding(561,undefined,1)(value),bypass:()=>readBinding(133,undefined,1),playwright:()=>readBinding(15,undefined,1)});},
    f2059:({readBinding})=>function(){return printTicketInBrowser(this,{bringToFront:page=>readBinding(123,undefined,1)(page)});},
    f2061:()=>function(page){return dumpAuthState(this,page);},
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
    f865:({readBinding})=>function(){return formsVault.list(this,formsVaultDependencies(readBinding,dependencies));},
    f869:()=>function(ids){return formsVault.reorderForms(this,ids);},
    f871:()=>function(){return formsVault.all(this);},
    f873:()=>function(id){return formsVault.get(this,id);},
    f875:()=>function(form){return formsVault.save(this,form);},
    f876:({readBinding})=>function(forms){return formsVault.saveMany(this,forms,formsVaultDependencies(readBinding,dependencies));},
    f879:()=>function(id){return formsVault.remove(this,id);},
    f881:()=>function(){return formsVault.deleteAll(this);},
    f882:({readBinding})=>function(id){return formsVault.duplicate(this,id,formsVaultDependencies(readBinding,dependencies));},
    f884:({readBinding})=>function(){return formsVault.migrateLabels(this,formsVaultDependencies(readBinding,dependencies));},
    f885:()=>function(){return formsVault.clearAvailTimingOverrides(this);},
    f886:({readBinding})=>function(epoch){return formsVault.adoptAvailabilityDefaults(this,epoch,formsVaultDependencies(readBinding,dependencies));},
    f888:({readBinding})=>function(form){return formsVault.normalizeTiming(this,form,formsVaultDependencies(readBinding,dependencies));},
    f889:({readBinding})=>function(){return formsVault.readVault(this,formsVaultDependencies(readBinding,dependencies));},
    f890:()=>function(){return formsVault.locked(this);},
    f891:()=>function(){return formsVault.readAll(this);},
    f893:()=>function(){return formsVault.readForWrite(this);},
    f895:({readBinding})=>function(forms){return formsVault.writeAll(this,forms,formsVaultDependencies(readBinding,dependencies));},
    f896:()=>function(form){return formsVault.summarizeForm(form);},
    ...recordVaultFactories(dependencies),
    ...historyVaultFactories(dependencies),
    ...windowIpcFactories(dependencies),
    ...windowHelperFactories(),
    ...ordinaryIpcFactories(dependencies),
    ...dataIpcFactories(dependencies),
    ...settingsIpcFactories(),
    ...transferIpcFactories(dependencies),
    ...formsTransferFactories(dependencies),
    ...backupIpcFactories(dependencies),
    f484:({readBinding})=>function(name,text){return formCodecs.parseFormFile(name,text,{
      extensions:()=>readBinding(324,'_I'),csv:text=>readBinding(323)(text),
    });},
    f485:({readBinding})=>function(model,date){return formCodecs.exportForm(model,date,{
      paymentName:method=>readBinding(315)(method),foodNames:()=>readBinding(314,'bI'),
      isoNow:()=>new (dependencies.dateConstructor??Date)().toISOString(),
    });},
    f486:({readBinding})=>function(passenger,index){return formCodecs.exportPassenger(passenger,index,()=>readBinding(314,'bI',1));},
    f473:()=>formsCsv.parseCsv,
    f474:()=>formsCsv.nonemptyCell,f475:()=>formsCsv.nonemptyCell,
    f476:()=>formsCsv.parsePassengers,f477:()=>formsCsv.trimCell,f478:()=>formsCsv.parsePassenger,
    f479:()=>formsCsv.trimNullableCell,f480:()=>formsCsv.passengerHasName,
    f481:({readBinding})=>function(text){return formsCsv.parseFormsCsv(text,{
      rows:text=>readBinding(321)(text),passengers:text=>readBinding(322)(text),
    });},
    f482:()=>formsCsv.normalizeHeader,
    f483:({readBinding})=>function(...aliases){return formsCsv.aliasedCell(readBinding(2),readBinding(3,undefined,1),aliases);},
    f487:()=>formNormalization.defaultForm,
    f414:()=>recordCodecs.exportLogin,
    f415:({readBinding})=>function(input,id,now){return recordCodecs.loginFromLine(input,id,now,()=>readBinding(254)());},
    f416:()=>recordCodecs.loginFromObject,f417:()=>recordCodecs.scalarText,
    f418:({readBinding})=>function(value){return recordCodecs.validUpi(value,()=>readBinding(258,'Ky'));},
    f419:({readBinding})=>function(method,upi){return recordCodecs.railPaymentMethod(method,upi,value=>readBinding(259)(value));},
    f420:({readBinding})=>function(input,now){return recordCodecs.paymentFromInput(input,now,{
      valid:value=>readBinding(259)(value),now:()=>(dependencies.now??(()=>Date.now()))(),random:()=>(dependencies.random??Math.random)(),
    });},
    f421:()=>recordCodecs.exportProxy,
    f422:({readBinding})=>function(input){return recordCodecs.parseProxy(input,line=>readBinding(263)(line));},
    f423:({readBinding})=>function(input,id,now){return recordCodecs.proxyFromInput(input,id,now,line=>readBinding(263)(line));},
    f424:()=>recordCodecs.scalarText,
    f3552:({readBinding})=>function(){return settingsStore.autoUpdate(()=>readBinding(1768)());},
    f3553:({readBinding})=>function(){return settingsStore.readSettings({fs:()=>readBinding(18,'y'),path:()=>readBinding(1766)()});},
    f3554:({readBinding})=>function(value){return settingsStore.writeSettings(value,{
      fs:()=>readBinding(18,'y'),path:()=>readBinding(1766)(),userData:()=>readBinding(22,'x').app.getPath('userData'),
      pid:()=>dependencies.processObject?.pid??process.pid,now:()=>(dependencies.now??(()=>Date.now()))(),
    });},
    f3555:({readBinding})=>function(){return settingsStore.windowPinned(()=>readBinding(1768)());},
    f3556:()=>settingsStore.applyWindowPin,
    f472:({readBinding})=>function(value,id,now){return formNormalization.normalizeForm(value,id,now,{
      defaults:(...args)=>readBinding(327)(...args),isRecord:value=>readBinding(297)(value),
      string:value=>readBinding(298)(value),label:(...args)=>readBinding(281)(...args),
      enumValue:(...args)=>readBinding(299)(...args),quotas:()=>readBinding(295,'wI'),classes:()=>readBinding(294,'lI'),
      paymentMethods:()=>readBinding(296,'uI'),fare:value=>readBinding(300)(value),racers:value=>readBinding(301)(value),
      paymentMethod:value=>readBinding(317)(value),passenger:()=>readBinding(319),
    });},
    f2196:({readBinding})=>function(resolve){
      return startPaytmWatch(resolve,readBinding(2),readBinding(4),readBinding(5),readBinding(6));
    },
  };
}
module.exports={reconstructedPayment};
