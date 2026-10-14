'use strict';

// Local build/device inspections. Additional publisher gates are listed below.
const checks = Object.freeze({
  f2595: 'publisher build integrity',
  f2605: 'local debugger inspection',
  f2635: 'local process denylist',
  f2684: 'local scan location readiness',
  f2685: 'local software/folder denylist',
  f2689: 'local quick process denylist',
  f2749: 'local certificate denylist',
  f2758: 'local security check coordinator',
  f2810: 'local TLS interception probe',
  f2835: 'continuous local tamper monitor',
});

function developmentOverrides(log = () => {}) {
  const overrides=Object.fromEntries(Object.entries(checks).map(([id, label]) => [id,
    async function () {
      log('development-check-skipped', {id, check: label});
      if(id==='f2758')return {passed:true,skipped:true,checks:[]};
      if(id==='f2810')return [];
      if(id==='f2835')return undefined;
      return {
        name: this?.name || label,
        passed: true,
        severity: 'info',
        detail: 'Skipped for the editable local development build',
        remediation: '',
        findings: [],
      };
    },
  ]));
  function nexusVersionGate() {
    log('nexus-vendor-version-gate-removed');
    const version=require('../../../package.json').version;
    return {allowed:true,state:'skipped',currentVersion:version,allowedVersions:[version],availableVersions:[],
      config:{TestingAllowed:true,extraAnalytics:false,maxPair:8,loginMode:['auto','manual','direct','direct2']},
      fromCache:false,force:false,reason:'Nexus source build',sysReady:true,sysState:'ready'};
  }
  overrides.f2539=async function(){return nexusVersionGate.call(this);};
  overrides.f2549=async function(){return nexusVersionGate.call(this);};
  overrides.f2877=function(){log('nexus-vendor-forced-shutdown-removed');};
  overrides.f2009=async function(){log('nexus-vendor-reporting-disabled');return {ok:true,skipped:true};};
  // True selects the existing key-free booking branch.
  overrides.f3370=function(){return true;};
  overrides.f3383=async function(){log('nexus-per-booking-vendor-license-gate-removed');return {ok:true};};
  return overrides;
}

module.exports = {checks, developmentOverrides};
