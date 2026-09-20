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
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }

    const token = auth.slice(7);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return json({ error: 'UNAUTHORIZED' }, 401);

    const { data: actor, error: actorError } = await admin
      .from('qa_users')
      .select('role,active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (actorError || !actor || !actor.active) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').toLowerCase();
    const previewStudentId = String(body?.previewStudentId || '');
    const previewTeacherId = String(body?.previewTeacherId || '');

    if (!['student', 'teacher'].includes(action)) {
      return json({ error: 'INVALID_ACTION' }, 400);
    }

    if (previewStudentId || previewTeacherId) {
      if (actor.role !== 'owner') return json({ error: 'OWNER_ONLY' }, 403);
      if (previewStudentId && previewTeacherId) return json({ error: 'AMBIGUOUS_PREVIEW' }, 400);
    }

    if (action === 'student') {
      let studentQuery = admin
        .from('qa_students')
        .select('student_id,student_code,full_name,status,teacher_id')
        .limit(1);

      if (previewStudentId) {
        studentQuery = studentQuery.eq('student_id', previewStudentId);
      } else {
        if (actor.role !== 'student') return json({ error: 'ROLE_NOT_ALLOWED' }, 403);
        studentQuery = studentQuery.eq('user_id', user.id);
      }

      const { data: student, error: studentError } = await studentQuery.maybeSingle();
      if (studentError) throw studentError;
      if (!student) return json({ error: 'STUDENT_PROFILE_NOT_FOUND' }, 404);

      let teacher: Record<string, unknown> | null = null;

      if (student.teacher_id) {
        const { data: teacherRow, error: teacherError } = await admin
          .from('qa_teachers')
          .select('teacher_id,teacher_code,full_name,full_name_bn,phone,specialization,active')
          .eq('teacher_id', student.teacher_id)
          .maybeSingle();

        if (teacherError) throw teacherError;
        if (teacherRow) {
          teacher = {
            teacher_id: teacherRow.teacher_id,
            teacher_code: teacherRow.teacher_code,
            full_name: teacherRow.full_name,
            full_name_bn: teacherRow.full_name_bn,
            phone: teacherRow.phone || '',
            specialization: teacherRow.specialization || '',
            active: teacherRow.active !== false,
          };
        }
      }

      return json({
        ok: true,
        action,
        student: {
          student_id: student.student_id,
          student_code: student.student_code,
          full_name: student.full_name,
          status: student.status,
        },
        teacher,
      });
    }

    let teacherQuery = admin
      .from('qa_teachers')
      .select('teacher_id,teacher_code,full_name,full_name_bn,phone,specialization,active,user_id')
      .limit(1);

    if (previewTeacherId) {
      teacherQuery = teacherQuery.eq('teacher_id', previewTeacherId);
    } else {
      if (actor.role !== 'teacher') return json({ error: 'ROLE_NOT_ALLOWED' }, 403);
      teacherQuery = teacherQuery.eq('user_id', user.id);
    }

    const { data: teacher, error: teacherError } = await teacherQuery.maybeSingle();
    if (teacherError) throw teacherError;
    if (!teacher) return json({ error: 'TEACHER_PROFILE_NOT_FOUND' }, 404);

    const { data: students, error: studentsError } = await admin
      .from('qa_students')
      .select('student_id,student_code,full_name,phone,status,teacher_id')
      .eq('teacher_id', teacher.teacher_id)
      .order('full_name', { ascending: true });

    if (studentsError) throw studentsError;

    return json({
      ok: true,
      action,
      teacher: {
        teacher_id: teacher.teacher_id,
        teacher_code: teacher.teacher_code,
        full_name: teacher.full_name,
        full_name_bn: teacher.full_name_bn,
        phone: teacher.phone || '',
        specialization: teacher.specialization || '',
        active: teacher.active !== false,
      },
      students: (students || []).map((student) => ({
        student_id: student.student_id,
        student_code: student.student_code,
        full_name: student.full_name,
        phone: student.phone || '',
        status: student.status,
      })),
    });
  } catch (error) {
    console.error('portal-teacher-student error', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
