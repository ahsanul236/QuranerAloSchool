import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const client = createClient(url, anonKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const auth = req.headers.get('authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'UNAUTHORIZED' }, 401);
    const token = auth.slice(7);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return json({ error: 'UNAUTHORIZED' }, 401);

    const { data: actor, error: actorError } = await admin
      .from('qa_users')
      .select('role,active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (actorError || !actor || actor.role !== 'owner' || !actor.active) {
      return json({ error: 'OWNER_ONLY' }, 403);
    }

    const body = await req.json();
    const entityType = String(body?.entityType || '').toLowerCase();
    const entityId = String(body?.entityId || '');
    if (!entityId || !['student', 'teacher', 'helper'].includes(entityType)) {
      return json({ error: 'INVALID_INPUT' }, 400);
    }

    if (entityType === 'student') {
      const { data, error } = await admin
        .from('qa_students')
        .select('student_id,student_code,full_name,status,phone,email')
        .eq('student_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'NOT_FOUND' }, 404);
      return json({ ok: true, entityType, entity: data });
    }

    if (entityType === 'helper') {
      const { data, error } = await admin
        .from('qa_staff')
        .select('staff_id,staff_code,full_name,staff_type,active,user_id')
        .eq('staff_id', entityId)
        .eq('staff_type', 'helper')
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'NOT_FOUND' }, 404);
      return json({ ok: true, entityType, entity: data });
    }

    const { data, error } = await admin
      .from('qa_teachers')
      .select('teacher_id,teacher_code,full_name,specialization,active,user_id')
      .eq('teacher_id', entityId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'NOT_FOUND' }, 404);
    return json({ ok: true, entityType, entity: data });
  } catch (error) {
    console.error('portal-preview error', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
