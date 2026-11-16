const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const asar=require('@electron/asar');
(async()=>{
 const installed=path.join(process.env.LOCALAPPDATA,'Programs/arara-vibes/resources/app.asar');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vibes-windows-fix-'));
 const tree=path.join(scratch,'app');
 const backup=path.join(process.env.LOCALAPPDATA,'AraraVibesBackups',new Date().toISOString().replace(/[:.]/g,'-'),'app.asar');
 fs.mkdirSync(path.dirname(backup),{recursive:true});
 fs.copyFileSync(installed,backup,fs.constants.COPYFILE_EXCL);
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(hash(installed)!==hash(backup))throw Error('Backup verification failed');
 asar.extractAll(installed,tree);
 const original=fs.readFileSync(path.join(tree,'dist/main.cjs'),'utf8');
 const next=fs.readFileSync('dist/main.cjs','utf8');
 if(original===next)throw Error('No correction to apply');
 if(!original.includes('const location = (0, import_node_fs.realpathSync)(installed)'))throw Error('Installed runtime changed unexpectedly');
 fs.writeFileSync(path.join(tree,'dist/main.cjs'),next);
 const staged=path.join(scratch,'app.asar');
 await asar.createPackage(tree,staged);
 const files=asar.listPackage(installed).map(name=>name.slice(1)).filter(name=>!asar.statFile(installed,name).files);
 for(const file of files){if(file.replaceAll('\\','/')==='dist/main.cjs')continue;if(!asar.extractFile(installed,file).equals(asar.extractFile(staged,file)))throw Error('Unexpected package change: '+file)}
 const replacement=installed+'.windows-fix';fs.copyFileSync(staged,replacement);fs.renameSync(replacement,installed);
 console.log(JSON.stringify({backup,originalSHA256:hash(backup),installedSHA256:hash(installed),unchangedFiles:files.length-1}));
})().catch(error=>{console.error(error);process.exitCode=1});


