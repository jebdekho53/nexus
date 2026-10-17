'use strict';
const fs=require('node:fs'),path=require('node:path');
function releaseProfile(app,root){
 const profile=path.join(app.getPath('appData'),'Matrix','profiles','release');
 const legacy=path.join(root,'diagnostics','release-profile');
 if(!fs.existsSync(profile)&&fs.existsSync(legacy))fs.cpSync(legacy,profile,{recursive:true,errorOnExist:true});
 fs.mkdirSync(profile,{recursive:true});return profile;
}
module.exports={releaseProfile};
