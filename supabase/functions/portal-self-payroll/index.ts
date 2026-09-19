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

    if (actorError || !actor || !actor.active) return json({ error: 'UNAUTHORIZED' }, 401);\n    if (previewTeacherId && actor.role !== 'owner') return json({ error: 'OWNER_ONLY' }, 403);\n    if (!previewTeacherId && !['teacher', 'helper', 'owner'].includes(actor.role)) return json({ error: 'ROLE_NOT_ALLOWED' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list').toLowerCase();
    const payrollId = String(body?.payrollId || '');
    const previewTeacherId = String(body?.previewTeacherId || '');

    let employeeType = '';
    let employeeRefId = '';
    let employee: Record<string, unknown> | null = null;

    if (actor.role === 'owner' && previewTeacherId) {
      const { data: t, error: te } = await admin
        .from('qa_teachers')
        .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,active')
        .eq('teacher_id', previewTeacherId)
        .maybeSingle();
      if (te) throw te;
      if (!t) return json({ error: 'EMPLOYEE_NOT_FOUND' }, 404);
      employeeType = 'teacher';
      employeeRefId = t.teacher_id;
      employee = {
        code: t.teacher_code,
        name: t.full_name_bn || t.full_name,
        type: 'Teacher',
        phone: t.phone || '',
        email: t.email || '',
        extra: t.specialization || '',
      };
    } else {
      const { data: t, error: te } = await admin
        .from('qa_teachers')
        .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,active')
        .eq('user_id', user.id)
        .maybeSingle();

      if (te) throw te;

      if (t) {
        employeeType = 'teacher';
        employeeRefId = t.teacher_id;
        employee = {
          code: t.teacher_code,
          name: t.full_name_bn || t.full_name,
          type: 'Teacher',
          phone: t.phone || '',
          email: t.email || '',
          extra: t.specialization || '',
        };
      } else {
        const { data: s, error: se } = await admin
          .from('qa_staff')
          .select('staff_id,staff_code,full_name,phone,email,active')
          .eq('user_id', user.id)
          .maybeSingle();

        if (se) throw se;
        if (!s) return json({ error: 'EMPLOYEE_NOT_FOUND' }, 404);

        employeeType = 'helper';
        employeeRefId = s.staff_id;
        employee = {
          code: s.staff_code,
          name: s.full_name,
          type: 'Helper',
          phone: s.phone || '',
          email: s.email || '',
          extra: '',
        };
      }
    }

    let query = admin
      .from('qa_payroll_records')
      .select('payroll_id,employee_user_id,employee_type,employee_ref_id,employee_code_snapshot,employee_name_snapshot,created_by,payroll_month,basic,allowance,bonus,overtime,deduction,leave_deduction,advance,adjustment,net_payable,status,paid_at,payment_method,payment_reference,notes')
      .eq('employee_type', employeeType)
      .eq('employee_ref_id', employeeRefId)
      .order('payroll_month', { ascending: false })
      .limit(100);

    if (action === 'get') {
      if (!payrollId) return json({ error: 'PAYROLL_ID_REQUIRED' }, 400);
      query = query.eq('payroll_id', payrollId);
    } else if (action !== 'list') {
      return json({ error: 'INVALID_ACTION' }, 400);
    }

    const { data: payrolls, error: payrollError } = await query;
    if (payrollError) throw payrollError;

    const rows = payrolls || [];
    const paidRows = rows.filter((row) => row.status === 'paid');
    const totalPaid = paidRows.reduce((sum, row) => sum + Number(row.net_payable || 0), 0);
    const latestPaid = paidRows[0] || null;

    return json({
      ok: true,
      employeeType,
      employee,
      payrolls: rows,
      summary: {
        paidCount: paidRows.length,
        totalPaid,
        latestPaidAmount: latestPaid ? Number(latestPaid.net_payable || 0) : 0,
        latestPaidMonth: latestPaid?.payroll_month || null,
      },
    });
  } catch (error) {
    console.error('portal-self-payroll error', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
