'use strict';
const crypto=require('node:crypto');
const hash=(kind,value)=>crypto.createHash('sha256').update('matrix-trial-v1:'+kind+':'+value.trim().toLowerCase()).digest('hex');
const useful=value=>typeof value==='string'&&value.trim().length>=5&&!/^(default string|none|unknown|to be filled by o\.?e\.?m\.?|system serial number|0+|f+|0{8}-0{4}-0{4}-0{4}-0{12})$/i.test(value.trim());
function fromHardware(info){
 if(!useful(info.uuid)||!/^\{?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}?$/i.test(info.uuid.trim())||/^(0+|f+)$/i.test(info.uuid.replace(/[^a-f0-9]/gi,'')))throw Error('Stable device identity unavailable. Contact your seller for a key.');
 return{schema:1,hardware:hash('uuid',info.uuid),...(useful(info.board)?{board:hash('board',info.board)}:{}),...(useful(info.machine)?{os:hash('os',info.machine)}:{}),...(useful(info.disk)?{disk:hash('disk',info.disk)}:{}),...(useful(info.cpu)?{cpu:hash('cpu',info.cpu)}:{}),virtual:/vmware|virtualbox|qemu|kvm|xen|parallels|virtual machine|amazon ec2|google compute|openstack/i.test([info.manufacturer,info.model].join(' '))};
}
function collect({platform=process.platform,exec=require('node:child_process').execFileSync}={}){
 if(platform!=='win32')throw Error('Automatic trial currently requires supported Windows hardware. Contact your seller.');
 const command="$p=Get-CimInstance Win32_ComputerSystemProduct; $b=Get-CimInstance Win32_BaseBoard; $c=Get-CimInstance Win32_ComputerSystem; $disk=Get-CimInstance Win32_DiskDrive | Where-Object {$_.SerialNumber -and $_.InterfaceType -ne 'USB'} | Sort-Object Index | Select-Object -First 1; $cpu=Get-CimInstance Win32_Processor | Sort-Object DeviceID | Select-Object -First 1; $m=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid; @{uuid=$p.UUID;board=$b.SerialNumber;manufacturer=$c.Manufacturer;model=$c.Model;machine=$m;disk=$disk.SerialNumber;cpu=$cpu.ProcessorId}|ConvertTo-Json -Compress";
 const info=JSON.parse(exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,encoding:'utf8',stdio:['ignore','pipe','ignore']}));
 return fromHardware(info);
}
module.exports={collect,fromHardware};
