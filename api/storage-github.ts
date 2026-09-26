export const config = { runtime: 'edge' };
import { createClient } from '@supabase/supabase-js';
const cors={'Access-Control-Allow-Origin':'https://ahsanul236.github.io','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Vary':'Origin'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...cors}});
function env(name:string){const r=globalThis as any;return String(r?.process?.env?.[name]||r?.Deno?.env?.get?.(name)||'');}
async function requireAdmin(req:Request){
 const auth=req.headers.get('authorization')||''; if(!auth.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
 const url=env('SUPABASE_URL')||'https://xjysbpthosvjxzujmuhe.supabase.co';
 const anon=env('SUPABASE_ANON_KEY')||env('SUPABASE_PUBLISHABLE_KEY')||'sb_publishable_uPx611I8B85nVyLg7PjcPg_jb7mxuxd';
 const service=env('SUPABASE_SERVICE_ROLE_KEY')||env('SUPABASE_SECRET_KEY'); if(!service) throw new Error('SERVER_NOT_CONFIGURED');
 const authDb=createClient(url,anon,{auth:{persistSession:false}}); const adminDb=createClient(url,service,{auth:{persistSession:false}});
 const {data:{user},error}=await authDb.auth.getUser(auth.slice(7)); if(error||!user) throw new Error('UNAUTHORIZED');
 const {data,error:pe}=await adminDb.from('qa_users').select('role,active').eq('user_id',user.id).maybeSingle();
 if(pe||!data?.active||data.role!=='owner'&&data.role!=='super_admin') throw new Error('FORBIDDEN');
}
export default async function handler(req:Request){
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET') return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  await requireAdmin(req); const token=env('GITHUB_STORAGE_TOKEN'); if(!token) throw new Error('GITHUB_STORAGE_NOT_CONFIGURED');
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const ur=await fetch('https://api.github.com/user',{headers}); if(!ur.ok) throw new Error('GITHUB_AUTH_FAILED'); const user=await ur.json();
  const br=await fetch(`https://api.github.com/users/${encodeURIComponent(user.login)}/settings/billing/usage`,{headers});
  if(!br.ok) return json({provider:'github',status:'unavailable',httpStatus:br.status,detail:(await br.text()).slice(0,180)});
  return json({provider:'github',status:'connected',login:user.login,usage:await br.json()});
 }catch(e:any){const m=String(e?.message||e);console.error('[storage-github]',m);return json({error:m},m==='UNAUTHORIZED'?401:m==='FORBIDDEN'?403:500);}
}