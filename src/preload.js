'use strict';
const {ipcRenderer,contextBridge}=require('electron');

let base='';
try{base=(ipcRenderer.sendSync('config:get')||{}).baseUrl||'';}catch{}
let baseOrigin='';
try{baseOrigin=new URL(base).origin;}catch{}

/* ---------- 本地页面（设置 / 离线提示） ---------- */
if(location.protocol==='file:'){
 if(/setup\.html$/i.test(location.pathname)){
  contextBridge.exposeInMainWorld('fnosSetup',{
   get:()=>ipcRenderer.invoke('config:get'),
   save:url=>ipcRenderer.invoke('setup:save',url),
   cancel:()=>ipcRenderer.send('setup:cancel'),
  });
 }else{
  window.addEventListener('DOMContentLoaded',()=>{
   const b=document.getElementById('retry');
   if(b)b.addEventListener('click',()=>ipcRenderer.send('retry'));
  });
 }
}
/* ---------- fnOS 网页 ---------- */
else if(baseOrigin&&location.origin===baseOrigin){
 window.addEventListener('DOMContentLoaded',async()=>{
  if(location.pathname.startsWith('/p'))setTimeout(initDragExport,300);
  await initAutoLogin();
 });
}

/* ---------------- 自动登录 ---------------- */
async function initAutoLogin(){
 const stored=await ipcRenderer.invoke('login:read').catch(()=>null);
 let filled=false,attempted=false,asked=false,automatic=false;
 const visible=e=>e&&e.getClientRects().length>0;
 const fields=()=>({u:document.querySelector('input[name="username"]'),p:document.querySelector('input[name="password"]')});
 const set=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
 const tick=()=>{
  const {u,p}=fields();
  if(location.pathname.startsWith('/p')&&document.querySelector('#root')?.innerText.trim()){clearInterval(timer);return;}
  if(!visible(u)||!visible(p))return;
  if(!stored)return;
  if(attempted){if(document.querySelector('.semi-toast-content,.semi-form-field-error-message'))clearInterval(timer);return;}
  if(!filled){filled=true;set(u,stored.username);set(p,stored.password);return;}
  const b=p.closest('form')?.querySelector('button[type="submit"]');
  if(b&&!b.disabled){attempted=true;automatic=true;b.click();setTimeout(()=>automatic=false,0);}
 };
 const timer=setInterval(tick,50);tick();
 setTimeout(()=>clearInterval(timer),10000);
 document.addEventListener('submit',()=>{
  const {u,p}=fields();if(automatic||asked||!visible(u)||!visible(p)||!u.value||!p.value)return;
  const data={username:u.value,password:p.value};
  if(stored&&stored.username===data.username&&stored.password===data.password)return;
  asked=true;ipcRenderer.invoke('login:save',data).catch(()=>{});
 },true);
}

/* ------------ 拖拽导出：沿用相册自身多选，按住已选照片拖出去 ------------ */
function initDragExport(){
 try{
  if(window.__fnDrag) return;
  window.__fnDrag=true;

  const SEL='img[src*="/api/v1/stream/p/t/"]';
  const MARK='[class*="primary-light-hover"]';
  let press=null,dragging=false,preparing=false,holdActive=false;
  let pill=null,pillTimer=0,fallbackTimer=0,suppressClickUntil=0;

  const style=document.createElement('style');
  style.id='fndrag-style';
  style.textContent=`
   #fndrag-pill{position:fixed;z-index:2147483647;left:0;top:0;padding:7px 12px;border-radius:999px;background:rgba(18,20,24,.94);color:#fff;
    font:12px/1.35 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);
    transition:opacity .14s ease,transform .14s ease;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap;letter-spacing:.2px}
   #fndrag-pill.on{opacity:1;transform:translateY(0)}
   #fndrag-pill b{color:#7db2ff;font-weight:600}
  `;
  (document.head||document.documentElement).appendChild(style);

  const mkPill=()=>{
   if(pill)return pill;
   pill=document.createElement('div');pill.id='fndrag-pill';pill.setAttribute('aria-hidden','true');
   document.body.appendChild(pill);return pill;
  };
  const flash=msg=>{
   const el=mkPill();
   el.innerHTML=msg;el.classList.add('on');
   const r=el.getBoundingClientRect();
   el.style.left=Math.max(8,innerWidth-r.width-24)+'px';
   el.style.top=Math.max(8,innerHeight-r.height-24)+'px';
   clearTimeout(pillTimer);
   pillTimer=setTimeout(()=>el.classList.remove('on'),2200);
  };

  const parse=img=>{
   const src=img&&img.currentSrc||img&&img.src||'';
   const m=/\/api\/v1\/stream\/p\/t\/(\d+)\/[a-z]+\/([^/?#]+)/i.exec(src);
   if(!m)return null;
   const url=src.replace(/(\/api\/v1\/stream\/p\/t\/\d+\/)[a-z]+(\/)/i,'$1o$2').split('?')[0].split('#')[0];
   return {id:m[1],url};
  };
  const photoOf=el=>{
   if(!el||!el.closest)return null;
   const img=el.closest(SEL);
   if(!img)return null;
   const info=parse(img);
   return info?{img,info}:null;
  };
  const prefetch=items=>{
   if(!items||!items.length)return;
   for(const it of items)ipcRenderer.invoke('drag:prepare',[{id:it.id,url:it.url}]).catch(()=>{});
  };

  const collectSelected=()=>{
   const out=[],seen=new Set();
   document.querySelectorAll(MARK).forEach(card=>{
    const img=card.querySelector&&card.querySelector(SEL);
    if(!img)return;
    const info=parse(img);
    if(info&&!seen.has(info.id)){seen.add(info.id);out.push({...info,img});}
   });
   return out;
  };

  const known=new Set();
  let syncTick=0;
  const syncSelection=()=>{
   if(syncTick)return;
   syncTick=requestAnimationFrame(()=>{
    syncTick=0;
    for(const it of collectSelected()){
     if(!known.has(it.id)){known.add(it.id);prefetch([it]);}
    }
   });
  };

  const filesOf=items=>{
   try{return ipcRenderer.sendSync('drag:files',items.map(i=>({id:i.id})))||{files:[],missing:[]};}
   catch{return {files:[],missing:items.map(i=>i.id)};}
  };

  const iconOf=img=>{
   try{
    const w=img.naturalWidth||1,h=img.naturalHeight||1;
    const S=128,c=document.createElement('canvas');c.width=S;c.height=S;
    const g=c.getContext('2d');
    const k=Math.max(S/w,S/h),dw=w*k,dh=h*k;
    g.drawImage(img,(S-dw)/2,(S-dh)/2,dw,dh);
    return c.toDataURL('image/png');
   }catch{return null;}
  };

  const beginDrag=(files,img)=>{
   dragging=true;
   ipcRenderer.send('drag:start',{files,icon:img?iconOf(img):null});
   suppressClickUntil=Date.now()+900;
   setTimeout(()=>{dragging=false;},2500);
  };

  const start=async info=>{
   if(dragging||preparing)return;
   preparing=true;
   try{
    const picked=collectSelected();
    const inSel=picked.some(p=>p.id===info.id);
    const items=inSel?picked:[info];
    const img=(items.find(p=>p.id===info.id)||items[0]||info).img||info._img;
    let res=filesOf(items);
    if(res.missing&&res.missing.length){
     flash(items.length>1?`正在取 <b>${items.length}</b> 张原图…`:'正在取原图…');
     prefetch(items);
     await Promise.all(items.map(i=>ipcRenderer.invoke('drag:prepare',[{id:i.id,url:i.url}]).catch(()=>null)));
     if(!holdActive){flash('原图已就绪，再拖一次即可');return;}
     res=filesOf(items);
    }
    if(!res||!res.files||!res.files.length){flash('取原图失败，请重试');return;}
    if(!holdActive){flash('原图已就绪，再拖一次即可');return;}
    beginDrag(res.files,img);
   }finally{preparing=false;}
  };

  document.addEventListener('pointerdown',e=>{
   if(e.button!==0||!e.isPrimary)return;
   const hit=photoOf(e.target);
   if(!hit)return;
   const {img,info}=hit;
   holdActive=true;
   try{img.draggable=true;}catch{}
   press={img,info,x:e.clientX,y:e.clientY,moved:false,started:false};
   prefetch([info]);
   const s=collectSelected();
   if(s.length)prefetch(s);
  },true);

  document.addEventListener('pointermove',e=>{
   if(!press)return;
   const dx=e.clientX-press.x,dy=e.clientY-press.y;
   if(!press.moved&&(dx*dx+dy*dy)>100)press.moved=true;
   if(press.moved&&(e.buttons&1)&&!dragging&&!press.started&&!fallbackTimer){
    fallbackTimer=setTimeout(()=>{
     fallbackTimer=0;
     if(press&&!press.started&&!dragging){press.started=true;press.info._img=press.img;start(press.info);}
    },140);
   }
  },true);

  document.addEventListener('dragstart',e=>{
   const hit=photoOf(e.target);
   if(!hit)return;
   e.preventDefault();e.stopPropagation();
   clearTimeout(fallbackTimer);fallbackTimer=0;
   if(press)press.started=true;
   hit.info._img=hit.img;
   start(hit.info);
  },true);

  const endPress=()=>{clearTimeout(fallbackTimer);fallbackTimer=0;holdActive=false;press=null;};
  document.addEventListener('pointerup',endPress,true);
  document.addEventListener('pointercancel',endPress,true);
  window.addEventListener('blur',endPress);

  document.addEventListener('click',e=>{
   if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}
  },true);

  try{
   const mo=new MutationObserver(syncSelection);
   mo.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
   syncSelection();
  }catch{}
 }catch(e){console.error('fnDrag init failed',e);}
}
