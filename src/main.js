'use strict';
/* 飞牛相册桌面壳（非官方）
 * 只是一个本地封装：用 Electron 打开自建 fnOS 上的相册网页，
 * 额外提供托盘常驻、自动登录、拖拽导出原图等桌面能力。
 */
const {app,BrowserWindow,Menu,ipcMain,dialog,safeStorage,shell,Tray,net,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');

const APP_NAME='FnOS Photos';
const DRAG_DIR=path.join(app.getPath('temp'),'FnOS-Photos-Drag');

let win=null,setup=null,tray=null;
let quitting=false;
let wantsWindow=!process.argv.includes('--silent');
let cfg={baseUrl:''};

/* ---------------- 配置 ---------------- */
const cfgPath=()=>path.join(app.getPath('userData'),'config.json');
function normalizeBase(u){
 u=String(u||'').trim().replace(/\/+$/,'');
 if(!u) return '';
 if(!/^https?:\/\//i.test(u)) u='http://'+u;
 try{const x=new URL(u);if(!x.hostname) return '';return x.origin+x.pathname.replace(/\/+$/,'');}catch{return '';}
}
function loadCfg(){
 try{
  let raw=fs.readFileSync(cfgPath(),'utf8');
  if(raw.charCodeAt(0)===0xFEFF)raw=raw.slice(1); // 去掉记事本/PowerShell 写入的 BOM
  const j=JSON.parse(raw);
  cfg.baseUrl=normalizeBase(j&&j.baseUrl);
 }catch{cfg.baseUrl='';}
 return cfg;
}
function saveCfg(){
 try{fs.mkdirSync(path.dirname(cfgPath()),{recursive:true});fs.writeFileSync(cfgPath(),JSON.stringify({baseUrl:cfg.baseUrl},null,2),'utf8');}catch{}
}
const homeUrl=()=>cfg.baseUrl+'/p';
const baseOrigin=()=>{try{return new URL(cfg.baseUrl).origin;}catch{return '';}};

/* ---------------- 原图下载 / 拖拽导出 ---------------- */
const dragCache=new Map();
const pending=new Map();
const EXT={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/heic':'.heic','image/heif':'.heif','image/bmp':'.bmp','image/avif':'.avif','video/mp4':'.mp4','video/quicktime':'.mov'};
const extOf=ct=>EXT[String(ct||'').split(';')[0].trim().toLowerCase()]||'.jpg';
const ensureDir=()=>{try{fs.mkdirSync(DRAG_DIR,{recursive:true});}catch{}};
const purgeOld=()=>{try{const now=Date.now();for(const f of fs.readdirSync(DRAG_DIR)){const p=path.join(DRAG_DIR,f);try{if(now-fs.statSync(p).mtimeMs>12*3600*1000)fs.rmSync(p,{force:true});}catch{}}}catch{}};

function httpGet(url){
 return new Promise((resolve,reject)=>{
  let req;
  try{req=net.request({url,session:win?win.webContents.session:undefined,useSessionCookies:true,redirect:'follow'});}catch(e){reject(e);return;}
  const timer=setTimeout(()=>{try{req.abort();}catch{}reject(new Error('timeout'));},45000);
  req.on('response',res=>{
   if(res.statusCode!==200){clearTimeout(timer);try{req.abort();}catch{}reject(new Error('HTTP '+res.statusCode));return;}
   const chunks=[];let size=0;
   res.on('data',c=>{size+=c.length;if(size>512*1024*1024){clearTimeout(timer);try{req.abort();}catch{}reject(new Error('too large'));return;}chunks.push(c);});
   res.on('end',()=>{clearTimeout(timer);resolve({body:Buffer.concat(chunks),headers:res.headers});});
   res.on('error',e=>{clearTimeout(timer);reject(e);});
  });
  req.on('error',e=>{clearTimeout(timer);reject(e);});
  req.end();
 });
}

function cachedFile(id){
 const hit=dragCache.get(String(id));
 if(!hit)return null;
 try{if(fs.existsSync(hit.file)&&fs.statSync(hit.file).size>0)return hit;}catch{}
 dragCache.delete(String(id));return null;
}

async function prepareOne(item){
 const id=String(item&&item.id||'');
 const url=String(item&&item.url||'');
 if(!/^\d+$/.test(id))throw new Error('bad id');
 if(!cfg.baseUrl||!url.startsWith(cfg.baseUrl+'/p/api/'))throw new Error('bad url');
 const hit=cachedFile(id);
 if(hit)return hit;
 if(pending.has(id))return pending.get(id);
 const job=(async()=>{
  const r=await httpGet(url);
  ensureDir();
  const ext=extOf(r.headers['content-type']);
  const file=path.join(DRAG_DIR,'照片_'+id+ext);
  const tmp=file+'.part';
  fs.writeFileSync(tmp,r.body);
  fs.renameSync(tmp,file);
  const rec={id,file,size:r.body.length,ext};
  dragCache.set(id,rec);
  return rec;
 })();
 pending.set(id,job);
 try{return await job;}finally{pending.delete(id);}
}

async function prepareMany(items){
 const list=Array.isArray(items)?items.slice(0,200):[];
 const out=[];
 for(const it of list){
  try{const r=await prepareOne(it);out.push({id:r.id,file:r.file,size:r.size,ok:true});}
  catch(e){out.push({id:String(it&&it.id||''),ok:false,error:String(e&&e.message||e)});}
 }
 return out;
}

/* ---------------- 窗口 ---------------- */
const trusted=e=>{
 if(!win||win.isDestroyed()||e.sender!==win.webContents) return false;
 try{return !!e.senderFrame&&new URL(e.senderFrame.url).origin===baseOrigin();}catch{return false;}
};
const vault=()=>path.join(app.getPath('userData'),'login.bin');

const showMain=()=>{
 if(!win||win.isDestroyed())return;
 wantsWindow=true;
 if(win.isMinimized())win.restore();
 win.show();win.focus();
 setTimeout(()=>{if(win&&!win.isDestroyed()&&wantsWindow&&!win.isVisible()){win.show();win.focus();}},50);
};

function createMainWindow(){
 win=new BrowserWindow({
  title:'飞牛相册',width:1280,height:800,show:false,autoHideMenuBar:true,backgroundColor:'#3a424f',
  icon:path.join(__dirname,'..','build','icon.ico'),
  webPreferences:{preload:path.join(__dirname,'preload.js'),partition:'persist:fnos-photos',contextIsolation:true,nodeIntegration:false,sandbox:true}
 });
 win.on('close',e=>{if(!quitting){e.preventDefault();wantsWindow=false;win.hide();}});
 win.webContents.on('before-input-event',async(e,input)=>{
  if(input.type!=='keyDown')return;
  if(input.key==='F11'){e.preventDefault();win.setFullScreen(!win.isFullScreen());}
  if(input.key==='F5'){e.preventDefault();win.reload();}
  if(input.control&&input.shift&&input.key==='Delete'){
   e.preventDefault();
   const a=await dialog.showMessageBox(win,{message:'清除已保存的账号密码并退出当前登录？',buttons:['取消','清除'],cancelId:0});
   if(a.response===1){fs.rmSync(vault(),{force:true});await win.webContents.session.clearStorageData();win.loadURL(homeUrl());}
  }
 });
 win.webContents.setWindowOpenHandler(({url})=>{try{if(['http:','https:'].includes(new URL(url).protocol))shell.openExternal(url);}catch{}return {action:'deny'};});
 win.webContents.on('will-navigate',(e,url)=>{try{if(new URL(url).origin!==baseOrigin()){e.preventDefault();if(/^https?:/.test(url))shell.openExternal(url);}}catch{e.preventDefault();}});
 win.webContents.on('did-fail-load',(_e,code,_desc,_url,isMain)=>{if(isMain&&code!==-3)win.loadFile(path.join(__dirname,'offline.html'));});
 win.loadURL(homeUrl());
 win.webContents.on('did-finish-load',()=>{if(wantsWindow)setTimeout(showMain,300);});
 setTimeout(()=>{if(wantsWindow)showMain();},10000);

 /* IPC：登录态 / 拖拽 */
 ipcMain.handle('login:read',async e=>{if(!trusted(e))return null;try{return JSON.parse((await safeStorage.decryptStringAsync(fs.readFileSync(vault()))).result);}catch{return null;}});
 ipcMain.handle('login:save',async(e,data)=>{
  if(!trusted(e)||typeof data?.username!=='string'||typeof data?.password!=='string'||!data.username||!data.password||data.password.length>4096)return false;
  if(!wantsWindow)return false;
  const answer=await dialog.showMessageBox(win,{type:'question',title:'自动登录',message:'保存此账号，用于下次自动登录？',detail:'密码使用 Windows 当前用户的 DPAPI 加密保存，可随时在托盘菜单清除。',buttons:['保存并启用','暂不保存'],defaultId:0,cancelId:1});
  if(answer.response!==0)return false;
  fs.writeFileSync(vault(),await safeStorage.encryptStringAsync(JSON.stringify(data)));return true;
 });
 ipcMain.handle('drag:prepare',async(e,items)=>trusted(e)?prepareMany(items):[]);
 ipcMain.on('drag:files',(e,items)=>{
  if(!trusted(e)){e.returnValue={files:[],missing:[]};return;}
  const files=[],missing=[];
  for(const it of (Array.isArray(items)?items:[])){
   const hit=cachedFile(String(it&&it.id||''));
   if(hit)files.push(hit.file);else missing.push(String(it&&it.id||''));
  }
  e.returnValue={files,missing};
 });
 ipcMain.on('drag:start',(e,payload)=>{
  if(!trusted(e))return;
  const files=((payload&&payload.files)||[]).filter(f=>typeof f==='string'&&f.startsWith(DRAG_DIR)&&fs.existsSync(f));
  if(!files.length)return;
  let icon=null;
  try{if(payload&&payload.icon)icon=nativeImage.createFromDataURL(payload.icon);}catch{}
  if(!icon||icon.isEmpty()||icon.getSize().width<8){try{icon=nativeImage.createFromPath(path.join(__dirname,'..','build','icon.ico'));}catch{}}
  if(!icon||icon.isEmpty())return;
  try{e.sender.startDrag({files,icon});}catch{}
 });
 ipcMain.on('retry',e=>{if(e.sender===win?.webContents&&e.senderFrame.url.startsWith('file:'))win.loadURL(homeUrl());});

 win.on('closed',()=>{win=null;});
}

/* ---------------- 首次设置 ---------------- */
function openSetup(modal){
 if(setup&&!setup.isDestroyed()){setup.show();setup.focus();return;}
 setup=new BrowserWindow({
  title:'设置 NAS 地址',width:560,height:320,resizable:false,minimizable:false,maximizable:false,
  parent:win&&!win.isDestroyed()?win:undefined,modal:!!modal,show:false,
  icon:path.join(__dirname,'..','build','icon.ico'),
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}
 });
 setup.loadFile(path.join(__dirname,'setup.html'));
 setup.once('ready-to-show',()=>{if(setup&&!setup.isDestroyed())setup.show();});
 setup.webContents.on('did-finish-load',()=>{
  setTimeout(()=>{if(setup&&!setup.isDestroyed()&&!setup.isVisible())setup.show();},250);
 });
 setup.on('closed',()=>{setup=null;});
}

ipcMain.handle('config:get',()=>({baseUrl:cfg.baseUrl}));
ipcMain.on('config:get',e=>{e.returnValue={baseUrl:cfg.baseUrl};});
ipcMain.handle('setup:save',(e,url)=>{
 const v=normalizeBase(url);
 if(!v)return {ok:false,error:'地址格式不对，例如 http://192.168.1.10:5666'};
 cfg.baseUrl=v;saveCfg();
 if(setup){const s=setup;setup=null;s.close();}
 if(win&&!win.isDestroyed()){win.loadURL(homeUrl());showMain();}
 else createMainWindow();
 return {ok:true,baseUrl:v};
});
ipcMain.on('setup:cancel',()=>{if(setup){const s=setup;setup=null;s.close();}if(!(win&&!win.isDestroyed()))app.quit();});

/* ---------------- 托盘 ---------------- */
function buildTray(){
 try{tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'..','build','icon.ico')));}catch{return;}
 tray.setToolTip('飞牛相册');
 tray.on('click',showMain);
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开飞牛相册',click:showMain},
  {label:'隐藏到托盘',click:()=>{wantsWindow=false;win&&win.hide();}},
  {label:'设置 NAS 地址…',click:()=>openSetup(true)},
  {type:'separator'},
  {label:'开机静默启动',type:'checkbox',checked:app.getLoginItemSettings({path:process.execPath,args:['--silent']}).openAtLogin,click:item=>app.setLoginItemSettings({openAtLogin:item.checked,path:process.execPath,args:['--silent'],name:'FnOSPhotos'})},
  {label:'退出',click:()=>app.quit()}
 ]));
}

/* ---------------- 启动 ---------------- */
app.on('before-quit',()=>{quitting=true;});
app.setName(APP_NAME);
app.setPath('userData',path.join(app.getPath('appData'),APP_NAME));

if(!app.requestSingleInstanceLock()) app.quit();
else{
 app.on('second-instance',(_e,argv)=>{
  if(argv.includes('--silent'))return;
  if(win)showMain(); else openSetup(false);
 });
 app.whenReady().then(()=>{
  Menu.setApplicationMenu(null);
  ensureDir();purgeOld();
  loadCfg();
  buildTray();
  if(cfg.baseUrl)createMainWindow(); else openSetup(false);
 });
 app.on('window-all-closed',()=>{if(!setup)app.quit();});
}
