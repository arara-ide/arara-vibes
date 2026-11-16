const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.setPath('userData',process.env.PROBE_PROFILE);
process.on('uncaughtException',e=>{console.error(e);app.exit(1)});
for(const key of ['realpathSync','readFileSync']){const original=fs[key];fs[key]=function(...args){try{const result=original.apply(this,args);if(String(args[0]).includes('WindowsApps'))console.log('FS',key,args[0],key==='realpathSync'?result:'ok');return result}catch(e){if(String(args[0]).includes('WindowsApps'))console.log('FS ERROR',String(e));throw e}}} const cp=require('node:child_process'); for(const key of ['spawn','execFileSync']) {const original=cp[key];cp[key]=function(...args){try{console.log('PROCESS',key,args[0]);const result=original.apply(this,args);if(key==='spawn'){result.on('error',e=>console.log('SPAWN ERROR',String(e)));result.on('exit',code=>console.log('EXIT',code));}else console.log('FOUND',String(result).slice(0,200));return result}catch(e){console.log('PROCESS ERROR',String(e));throw e}}} const {ipcMain}=require('electron');const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(channel,listener)=>handle(channel,async(event,input)=>{const result=await listener(event,input);console.log('ACTION',input.action,JSON.stringify(result).slice(0,200));return result}); require(process.env.PROBE_MAIN);
setTimeout(async()=>{
 for(const w of BrowserWindow.getAllWindows()) console.log('STATE',await w.webContents.executeJavaScript(`JSON.stringify({screens:[...document.querySelectorAll('.screen')].map(x=>({id:x.id,hidden:x.hidden})),text:document.body.innerText.slice(0,1800)})`).catch(String));
 app.quit();
},55000);


