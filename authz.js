import {setLanguageUser} from './ui-i18n.js?v=20261001-fourstep1';
export async function getAccess(supabase){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return null;
  setLanguageUser(session.user.id);
  const {data:profile,error:profileError}=await supabase.from('qa_users').select('user_id,email,full_name,role,active').eq('user_id',session.user.id).maybeSingle();
  if(profileError||!profile||!profile.active) return null;
  if(profile.role==='owner'){
    return {session,profile,permissions:new Set(),can(){ return true; }};
  }
  const [{data:userRows,error:userError},{data:roleRows,error:roleError}]=await Promise.all([
    supabase.from('qa_user_permissions').select('permission_code').eq('user_id',session.user.id).eq('allowed',true),
    supabase.from('qa_role_permissions').select('permission_code').eq('role',profile.role)
  ]);
  if(userError||roleError) return null;
  const permissions=new Set([...(userRows||[]),...(roleRows||[])].map(row=>row.permission_code));
  return {
    session,
    profile,
    permissions,
    can(permission){ return permissions.has(permission); }
  };
}

export async function requireAccess(supabase,permission,{redirect='./'}={}){
  const access=await getAccess(supabase);
  if(!access){ await supabase.auth.signOut(); window.location.replace(redirect); return null; }
  if(!access.can(permission)){ return {...access,denied:true}; }
  return access;
}
