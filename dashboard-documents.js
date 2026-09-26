import { getStorage, bytesToHuman } from './documents-client.js';

function $(id) { return document.getElementById(id); }

function storageApi(path){
 return location.hostname.endsWith('.vercel.app')?path:'https://quraneralo-school-drive-test.vercel.app'+path;
}

async function storageSession(){
 const cfg=window.QURANER_ALO_CONFIG;
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
 if(!cfg) throw new Error('AUTH_CONFIG_UNAVAILABLE');
 const client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
 return (await client.auth.getSession()).data.session;
}

async function init() {
  const box = $('googleDriveStorageCard');
  if (!box) return;
  try {
    const data = await getStorage();
    $('googleDriveStorageStatus').textContent = 'Connected';
    $('storageOverviewStatus').textContent = 'Live';
    $('googleDriveStorageUsed').textContent = bytesToHuman(data.usedBytes);
    $('googleDriveStorageFree').textContent = data.totalBytes ? bytesToHuman(data.freeBytes) : '—';
    $('googleDriveStorageTotal').textContent = data.totalBytes ? bytesToHuman(data.totalBytes) : '—';
    $('googleDriveStoragePercent').textContent = data.usedPercent == null ? '—' : data.usedPercent+'%';
    $('googleDriveStorageBar').style.width = data.usedPercent == null ? '0%' : Math.min(100, Math.max(0, data.usedPercent))+'%';
  } catch (error) {
    console.warn('Google Drive storage unavailable', error);
    $('googleDriveStorageStatus').textContent = error?.message === 'GOOGLE_DRIVE_NOT_CONFIGURED' || error?.message === 'GOOGLE_DRIVE_CONFIG_INVALID' ? 'Not configured' : 'Unavailable';
    $('storageOverviewStatus').textContent = 'Partial';
    $('googleDriveStorageUsed').textContent = '—';
    $('googleDriveStorageFree').textContent = '—';
    $('googleDriveStorageTotal').textContent = '—';
    $('googleDriveStoragePercent').textContent = '—';
    $('googleDriveStorageBar').style.width = '0%';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();

async function loadGithubStorage(){
 const status=$('githubStorageStatus'); if(!status)return;
 try{
  const session=await storageSession(); if(!session?.access_token)throw new Error('UNAUTHORIZED');
  const res=await fetch(storageApi('/api/storage-github'),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'}); const data=await res.json();
  if(!res.ok||data.status!=='connected')throw new Error(data.error||data.detail||'GITHUB_USAGE_UNAVAILABLE');
  const rows=Array.isArray(data.usage?.usageItems)?data.usage.usageItems:[]; const sr=rows.filter(x=>/storage/i.test(String(x?.product||'')+' '+String(x?.sku||'')));
  const q=sr.reduce((s,x)=>s+(Number(x?.quantity)||0),0);
  $('githubStorageUsed').textContent=q?q.toFixed(q<10?2:1)+' '+(sr[0]?.unitType||''):'0'; $('githubStorageFree').textContent='Plan based'; $('githubStoragePercent').textContent='Usage'; status.textContent='Connected'; $('githubStorageBar').style.width='0%';
 }catch(e){console.warn('GitHub usage unavailable',e);status.textContent='Unavailable';$('githubStorageUsed').textContent='—';$('githubStorageFree').textContent='—';$('githubStoragePercent').textContent='—';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadGithubStorage,{once:true});else loadGithubStorage();

async function loadVercelStorage(){
 const status=$('vercelStorageStatus');if(!status)return;
 try{
  const session=await storageSession();if(!session?.access_token)throw new Error('UNAUTHORIZED');
  const r=await fetch(storageApi('/api/storage-vercel'),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'}),data=await r.json();if(!r.ok)throw new Error(data.error||'VERCEL_UNAVAILABLE');
  $('vercelStorageUsed').textContent=String(data.deploymentCount??0);$('vercelStorageFree').textContent=String(data.latest||'—');$('vercelStoragePercent').textContent='Health';status.textContent='Connected';$('vercelStorageBar').style.width=data.latest==='READY'?'100%':'55%';
 }catch(e){console.warn('Vercel status unavailable',e);status.textContent='Unavailable';$('vercelStorageUsed').textContent='—';$('vercelStorageFree').textContent='—';$('vercelStoragePercent').textContent='—';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadVercelStorage,{once:true});else loadVercelStorage();

async function loadSupabaseStorage(){
 const status=$('supabaseStorageStatus');if(!status)return;
 try{
  const session=await storageSession();if(!session?.access_token)throw new Error('UNAUTHORIZED');
  const r=await fetch(storageApi('/api/storage-supabase'),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'}),data=await r.json();if(!r.ok)throw new Error(data.error||'SUPABASE_UNAVAILABLE');
  const used=Number(data.database_bytes)||0,free=Number(data.database_free_bytes)||0,pct=Number(data.database_used_percent)||0;
  $('supabaseStorageUsed').textContent=bytesToHuman(used);$('supabaseStorageFree').textContent=bytesToHuman(free);$('supabaseStoragePercent').textContent=pct.toFixed(pct<10?1:0)+'%';$('supabaseStorageBar').style.width=Math.min(100,Math.max(0,pct))+'%';status.textContent='Live · Database';
 }catch(e){console.warn('Supabase storage unavailable',e);status.textContent='Unavailable';$('supabaseStorageUsed').textContent='—';$('supabaseStorageFree').textContent='—';$('supabaseStoragePercent').textContent='—';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadSupabaseStorage,{once:true});else loadSupabaseStorage();
