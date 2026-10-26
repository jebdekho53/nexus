'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const groups={
 admin:['services/control-plane/admin-login.test.cjs','services/control-plane/licensing.test.cjs','services/control-plane/hierarchy.test.cjs','services/control-plane/key-validity.test.cjs','services/control-plane/booking-ledger.test.cjs','services/control-plane/trials.test.cjs','services/control-plane/client-address.test.cjs'],
 booking:['test/booking-window-controls.test.cjs','test/ticket-docking.test.cjs','test/availability-default-adapter.test.cjs','test/high-load-handling-integration.test.cjs','test/csrf-countdown-integration.test.cjs','test/payment-complete-chain.test.cjs','test/qr-delivery.test.cjs','test/success-download.test.cjs','test/web-proxy-upgrade-integration.test.cjs'],
 desktop:['test/matrix-browser-installer.test.cjs','test/account-verification.test.cjs','test/id-check.test.cjs','test/activation.test.cjs','test/desktop-startup.test.cjs','test/trial-access.test.cjs','test/trial-device.test.cjs','test/booking-report.test.cjs'],
};
groups.core=[...groups.desktop,'services/control-plane/licensing.test.cjs','services/control-plane/trials.test.cjs','services/control-plane/booking-ledger.test.cjs','test/availability-default-adapter.test.cjs','test/payment-complete-chain.test.cjs','test/qr-delivery.test.cjs'];
const requested=process.argv.slice(2),selected=requested.length?requested:['core'];
if(selected.some(name=>!groups[name])){console.error('Choose core, admin, booking or desktop. Full migration comparisons: npm run test:full');process.exit(2);}
const files=[...new Set(selected.flatMap(name=>groups[name]))];
console.log(`Focused ${selected.join(' + ')} checks (${files.length} files).`);
const result=spawnSync(process.execPath,['--test','--test-concurrency=4',...files],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
