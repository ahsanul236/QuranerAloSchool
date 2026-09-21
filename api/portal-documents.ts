export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-File-Name',
};

const MAX_BYTES = 500 * 1024;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);
const ALLOWED_CATEGORIES = new Set(['profile_picture', 'birth_registration', 'nid', 'other_document']);
const ROLE_SET = new Set(['student', 'teacher', 'helper']);

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(
  JSON.stringify(body),
  { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders } }
);

let adminDb: ReturnType<typeof createClient> | null = null;
let authDb: ReturnType<typeof createClient> | null = null;

function initSupabaseClients() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_uPx611I8B85nVyLg7PjcPg_jb7mxuxd';
  const supabaseUrl = process.env.SUPABASE_URL || 'https://xjysbpthosvjxzujmuhe.supabase.co';

  if (!serviceKey) throw new Error('SUPABASE_SERVER_KEY_NOT_CONFIGURED');
  if (!anonKey) throw new Error('SUPABASE_CLIENT_KEY_NOT_CONFIGURED');
  if (!supabaseUrl) throw new Error('SUPABASE_URL_NOT_CONFIGURED');

  adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  authDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type Actor = {
  userId: string;
  role: string;
  active: boolean;
  permissions: Set<string>;
};

type Person = {
  role: 'student' | 'teacher' | 'helper';
  id: string;
  code: string;
  name: string;
  teacherId?: string | null;
};

function extOf(name: string) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

async function validateImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const mime = String(file.type || '').toLowerCase();
  if ((mime === 'image/jpeg' && !isJpeg) || (mime === 'image/png' && !isPng)) {
    throw new Error('INVALID_FILE_TYPE');
  }
}

function normalizeFilename(name: string) {
  const cleaned = String(name || 'document')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || 'document';
}

function escapeDriveQueryLiteral(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createDocumentToken() {
  return `d1_${crypto.randomUUID()}_${crypto.randomUUID()}`;
}

function base64urlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(value: string) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function documentTokenKey() {
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS || '';
  if (!raw) throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function createEphemeralDocumentToken(fileId: string) {
  const key = await documentTokenKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(String(fileId)),
  ));
  return `d2_${base64urlEncode(iv)}_${base64urlEncode(ciphertext)}`;
}

async function resolveEphemeralDocumentToken(token: string) {
  const parts = String(token || '').split('_');
  if (parts.length !== 3 || parts[0] !== 'd2') throw new Error('INVALID_DOCUMENT_TOKEN');
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = base64urlDecode(parts[1]);
    ciphertext = base64urlDecode(parts[2]);
  } catch {
    throw new Error('INVALID_DOCUMENT_TOKEN');
  }
  if (iv.length !== 12 || ciphertext.length < 17) throw new Error('INVALID_DOCUMENT_TOKEN');
  try {
    const key = await documentTokenKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const fileId = new TextDecoder().decode(new Uint8Array(plain));
    if (!fileId || fileId.length > 300) throw new Error('INVALID_DOCUMENT_TOKEN');
    return fileId;
  } catch {
    throw new Error('INVALID_DOCUMENT_TOKEN');
  }
}

async function ensureDocumentToken(file: Record<string, any>) {
  const props = { ...(file.appProperties || {}) };
  if (props.qa_doc_token) return String(props.qa_doc_token);
  if (!file.id) throw new Error('FILE_NOT_FOUND');
  const token = createDocumentToken();
  props.qa_doc_token = token;
  try {
    await driveJson(`files/${encodeURIComponent(file.id)}?fields=id,appProperties`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return token;
  } catch (error) {
    console.warn('Legacy document token write-back unavailable; using an ephemeral token.', {
      code: error instanceof Error ? error.message : 'UNKNOWN'
    });
    return createEphemeralDocumentToken(String(file.id));
  }
}

async function resolveDocumentToken(token: string) {
  const value = String(token || '');
  if (value.startsWith('d2_')) return resolveEphemeralDocumentToken(value);
  if (!value.startsWith('d1_')) throw new Error('INVALID_DOCUMENT_TOKEN');
  const q = [
    "trashed = false",
    `appProperties has { key='qa_app' and value='quraner-alo' }`,
    `appProperties has { key='qa_doc_token' and value='${escapeDriveQueryLiteral(value)}' }`,
  ].join(' and ');
  const data = await driveJson(`files?q=${encodeURIComponent(q)}&spaces=drive&pageSize=2&fields=files(id,appProperties,trashed)`);
  const file = (data.files || [])[0];
  if (!file?.id) throw new Error('INVALID_DOCUMENT_TOKEN');
  return String(file.id);
}

async function publicDocumentMetadata(file: Record<string, any>) {
  const meta = metadataFromFile(file);
  const token = await ensureDocumentToken(file);
  delete meta.fileId;
  return { ...meta, documentToken: token };
}

async function parseActor(req: Request): Promise<Actor> {
  if (!adminDb || !authDb) throw new Error('SUPABASE_CLIENTS_NOT_INITIALIZED');
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('UNAUTHORIZED');
  const token = auth.slice(7);

  const { data: { user }, error: authError } = await authDb.auth.getUser(token);
  if (authError || !user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await adminDb
    .from('qa_users')
    .select('role,active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.active) throw new Error('UNAUTHORIZED');

  if (profile.role === 'owner') {
    return { userId: user.id, role: profile.role, active: true, permissions: new Set(['*']) };
  }

  const [{ data: userRows }, { data: roleRows }] = await Promise.all([
    adminDb.from('qa_user_permissions').select('permission_code').eq('user_id', user.id).eq('allowed', true),
    adminDb.from('qa_role_permissions').select('permission_code').eq('role', profile.role),
  ]);

  const permissions = new Set([
    ...(userRows || []).map((x: { permission_code: string }) => x.permission_code),
    ...(roleRows || []).map((x: { permission_code: string }) => x.permission_code),
  ]);

  return { userId: user.id, role: profile.role, active: true, permissions };
}

function can(actor: Actor, permission: string) {
  return actor.permissions.has('*') || actor.permissions.has(permission);
}

async function resolveSelfPerson(actor: Actor): Promise<Person> {
  if (actor.role === 'student') {
    const { data, error } = await adminDb
      .from('qa_students')
      .select('student_id,student_code,full_name,teacher_id')
      .eq('user_id', actor.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('STUDENT_PROFILE_NOT_FOUND');
    return { role: 'student', id: data.student_id, code: data.student_code, name: data.full_name, teacherId: data.teacher_id };
  }

  if (actor.role === 'teacher') {
    const { data, error } = await adminDb
      .from('qa_teachers')
      .select('teacher_id,teacher_code,full_name,full_name_bn')
      .eq('user_id', actor.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('TEACHER_PROFILE_NOT_FOUND');
    return { role: 'teacher', id: data.teacher_id, code: data.teacher_code, name: data.full_name_bn || data.full_name };
  }

  if (actor.role === 'helper') {
    const { data, error } = await adminDb
      .from('qa_staff')
      .select('staff_id,staff_code,full_name')
      .eq('user_id', actor.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('HELPER_PROFILE_NOT_FOUND');
    return { role: 'helper', id: data.staff_id, code: data.staff_code, name: data.full_name };
  }

  throw new Error('ROLE_NOT_ALLOWED');
}

async function resolveAnyPerson(roleRaw?: string, personIdRaw?: string): Promise<Person> {
  const requestedRole = String(roleRaw || '').toLowerCase();
  const requestedId = String(personIdRaw || '');
  if (!ROLE_SET.has(requestedRole) || !requestedId) throw new Error('TARGET_REQUIRED');

  if (requestedRole === 'student') {
    const { data, error } = await adminDb
      .from('qa_students')
      .select('student_id,student_code,full_name,teacher_id')
      .eq('student_id', requestedId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('STUDENT_NOT_FOUND');
    return { role: 'student', id: data.student_id, code: data.student_code, name: data.full_name, teacherId: data.teacher_id };
  }

  if (requestedRole === 'teacher') {
    const { data, error } = await adminDb
      .from('qa_teachers')
      .select('teacher_id,teacher_code,full_name,full_name_bn')
      .eq('teacher_id', requestedId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('TEACHER_NOT_FOUND');
    return { role: 'teacher', id: data.teacher_id, code: data.teacher_code, name: data.full_name_bn || data.full_name };
  }

  const { data, error } = await adminDb
    .from('qa_staff')
    .select('staff_id,staff_code,full_name')
    .eq('staff_id', requestedId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('HELPER_NOT_FOUND');
  return { role: 'helper', id: data.staff_id, code: data.staff_code, name: data.full_name };
}

async function resolveTarget(actor: Actor, roleRaw?: string, personIdRaw?: string): Promise<Person> {
  const requestedRole = String(roleRaw || '').toLowerCase();
  const requestedId = String(personIdRaw || '');

  if (actor.role === 'student' || actor.role === 'teacher' || actor.role === 'helper') {
    const self = await resolveSelfPerson(actor);
    if (!requestedRole || !requestedId) return self;
    if (requestedRole !== actor.role || requestedId !== self.id) throw new Error('FORBIDDEN');
    return self;
  }

  if (!ROLE_SET.has(requestedRole) || !requestedId) throw new Error('TARGET_REQUIRED');
  const person = await resolveAnyPerson(requestedRole, requestedId);
  const permission =
    person.role === 'student' ? 'students.view' :
    person.role === 'teacher' ? 'teachers.view' :
    'staff.view';
  const managePermission =
    person.role === 'student' ? 'students.manage' :
    person.role === 'teacher' ? 'teachers.manage' :
    'staff.manage';
  if (!can(actor, permission) && !can(actor, managePermission)) throw new Error('FORBIDDEN');
  return person;
}

async function getGoogleCredentials() {
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS || '';
  if (!raw) throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
  let credentials: { client_id?: string; client_secret?: string; refresh_token?: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_DRIVE_CONFIG_INVALID');
  }
  if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
    throw new Error('GOOGLE_DRIVE_CONFIG_INVALID');
  }
  return credentials as { client_id: string; client_secret: string; refresh_token: string };
}

async function getAccessToken() {
  const credentials = await getGoogleCredentials();
  const body = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('Google token exchange failed', { status: res.status, error: data?.error });
    throw new Error('GOOGLE_AUTH_FAILED');
  }
  return String(data.access_token);
}

async function driveJson(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Google Drive API error', { status: res.status, path, error: data?.error?.message || data?.error });
    throw new Error('GOOGLE_DRIVE_API_ERROR');
  }
  return data;
}

async function driveBinary(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Google Drive binary API error', { status: res.status, path, errorText: errorText.slice(0, 500) });
    throw new Error('GOOGLE_DRIVE_API_ERROR');
  }
  return res;
}

async function findFolder(name: string, parentId?: string | null) {
  const escaped = escapeDriveQueryLiteral(name);
  let q = `name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  q += parentId ? ` and '${escapeDriveQueryLiteral(parentId)}' in parents` : ` and 'root' in parents`;
  const data = await driveJson(`files?q=${encodeURIComponent(q)}&spaces=drive&orderBy=createdTime&pageSize=10&fields=files(id,name,mimeType,parents)`);
  return (data.files || [])[0] || null;
}

async function ensureFolder(name: string, parentId?: string | null) {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];
  return driveJson('files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function ensurePersonFolder(person: Person, year: number) {
  const root = await ensureFolder('Quraner Alo Documents');
  const yearFolder = await ensureFolder(String(year), root.id);
  const roleFolderName = person.role === 'student' ? 'Students' : person.role === 'teacher' ? 'Teachers' : 'Helpers';
  const roleFolder = await ensureFolder(roleFolderName, yearFolder.id);
  const personFolder = await ensureFolder(person.code, roleFolder.id);
  return { root, yearFolder, roleFolder, personFolder };
}

function categoryAllowedForRole(role: Person['role'], category: string) {
  if (category === 'profile_picture' || category === 'other_document') return true;
  if (role === 'student') return category === 'birth_registration';
  return category === 'nid';
}

function metadataFromFile(file: Record<string, any>) {
  const props = file.appProperties || {};
  return {
    fileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size || 0),
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    category: props.qa_category || 'other_document',
    role: props.qa_role || '',
    personId: props.qa_person_id || '',
    personCode: props.qa_person_code || '',
    isProfile: props.qa_category === 'profile_picture',
  };
}

async function listDriveDocuments(person: Person, year?: number) {
  const q = [
    "trashed = false",
    `appProperties has { key='qa_app' and value='quraner-alo' }`,
    `appProperties has { key='qa_role' and value='${escapeDriveQueryLiteral(person.role)}' }`,
    `appProperties has { key='qa_person_id' and value='${escapeDriveQueryLiteral(person.id)}' }`,
    ...(year ? [`appProperties has { key='qa_year' and value='${String(year)}' }`] : []),
  ].join(' and ');
  const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,appProperties)';
  const data = await driveJson(`files?q=${encodeURIComponent(q)}&spaces=drive&orderBy=createdTime desc&pageSize=100&fields=${encodeURIComponent(fields)}`);
  return (data.files || []).map(metadataFromFile);
}

async function listPublicDriveDocuments(person: Person, year?: number) {
  const files = await listDriveDocuments(person, year);
  return Promise.all(files.map(publicDocumentMetadata));
}

function personCanViewOwn(actor: Actor, person: Person) {
  return actor.role === person.role && ['student', 'teacher', 'helper'].includes(actor.role);
}

async function canViewProfileImage(actor: Actor, target: Person) {
  if (actor.role === 'owner' || actor.role === 'admin') return true;

  if (!['student','teacher','helper'].includes(actor.role)) {
    const viewPermission =
      target.role === 'student' ? 'students.view' :
      target.role === 'teacher' ? 'teachers.view' :
      'staff.view';
    const managePermission =
      target.role === 'student' ? 'students.manage' :
      target.role === 'teacher' ? 'teachers.manage' :
      'staff.manage';
    return can(actor, viewPermission) || can(actor, managePermission);
  }

  if (actor.role === target.role) {
    const self = await resolveSelfPerson(actor);
    return self.id === target.id;
  }

  if (target.role === 'teacher' && actor.role === 'student') {
    const self = await resolveSelfPerson(actor);
    return self.teacherId === target.id;
  }

  if (target.role === 'student' && actor.role === 'teacher') {
    const self = await resolveSelfPerson(actor);
    const { data, error } = await adminDb
      .from('qa_students')
      .select('student_id')
      .eq('student_id', target.id)
      .eq('teacher_id', self.id)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  return false;
}

async function getFileMetadata(fileId: string) {
  if (!fileId) throw new Error('FILE_ID_REQUIRED');
  return driveJson(`files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,modifiedTime,appProperties,trashed,parents`);
}

async function authorizeFile(actor: Actor, file: Record<string, any>, action: 'view' | 'delete') {
  const props = file.appProperties || {};
  if (props.qa_app !== 'quraner-alo' || file.trashed) throw new Error('FILE_NOT_FOUND');

  const role = props.qa_role as Person['role'];
  const personId = String(props.qa_person_id || '');
  const category = String(props.qa_category || 'other_document');
  if (!ROLE_SET.has(role) || !personId) throw new Error('FILE_NOT_FOUND');

  const target: Person = { role, id: personId, code: String(props.qa_person_code || ''), name: '' };

  const viewPermission =
    role === 'student' ? 'students.view' :
    role === 'teacher' ? 'teachers.view' :
    'staff.view';
  const managePermission =
    role === 'student' ? 'students.manage' :
    role === 'teacher' ? 'teachers.manage' :
    'staff.manage';

  if (actor.role === 'owner' || actor.role === 'admin' || !['student','teacher','helper'].includes(actor.role)) {
    if (!can(actor, viewPermission) && !can(actor, managePermission)) throw new Error('FORBIDDEN');
    if (action === 'delete' && !can(actor, managePermission) && actor.role !== 'owner') throw new Error('FORBIDDEN');
    return { target, category };
  }

  if (action === 'delete') throw new Error('FORBIDDEN');

  const own = await personCanViewOwn(actor, target);
  if (own) return { target, category };

  if (action === 'view' && category === 'profile_picture') {
    if (await canViewProfileImage(actor, target)) return { target, category };
  }

  throw new Error('FORBIDDEN');
}

async function uploadNewFile(parentId: string, file: File, appProperties: Record<string, string>, fileName: string) {
  const metadata = {
    name: fileName,
    parents: [parentId],
    mimeType: file.type,
    appProperties: { qa_app: 'quraner-alo', ...appProperties },
  };

  const metadataJson = JSON.stringify(metadata);
  const metadataBytes = new TextEncoder().encode(metadataJson);
  const token = await getAccessToken();

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime,modifiedTime,appProperties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': String(metadataBytes.byteLength),
        'X-Upload-Content-Type': file.type,
        'X-Upload-Content-Length': String(file.size),
      },
      body: metadataJson,
    },
  );

  if (!initRes.ok) {
    const initText = await initRes.text().catch(() => '');
    let initData: any = {};
    try { initData = JSON.parse(initText || '{}'); } catch {}
    const status = initRes.status || 0;
    const reason = String(initData?.error?.errors?.[0]?.reason || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const message = String(initData?.error?.message || initText || initRes.statusText || 'No Google Drive error message')
      .replace(/[^a-zA-Z0-9 .,!?_-]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 180);
    console.error('Google Drive resumable init failed', { status, reason, message });
    throw new Error('GOOGLE_DRIVE_UPLOAD_FAILED');
  }

  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) {
    console.error('Google Drive resumable init missing Location header');
    throw new Error('GOOGLE_DRIVE_UPLOAD_INIT_FAILED_200_NO_LOCATION');
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const uploadRes = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type,
      'Content-Length': String(fileBytes.byteLength),
    },
    body: fileBytes,
  });

  const uploadText = await uploadRes.text().catch(() => '');
  let data: any = {};
  try { data = JSON.parse(uploadText || '{}'); } catch {}

  if (!uploadRes.ok || !data.id) {
    const status = uploadRes.status || 0;
    const reason = String(data?.error?.errors?.[0]?.reason || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const message = String(data?.error?.message || uploadText || uploadRes.statusText || 'No Google Drive error message')
      .replace(/[^a-zA-Z0-9 .,!?_-]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 180);
    console.error('Google Drive resumable upload failed', { status, reason, message });
    throw new Error('GOOGLE_DRIVE_UPLOAD_FAILED');
  }

  return data;
}

async function replaceFileContent(fileId: string, file: File, fileName?: string) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type,
      'Content-Length': String(file.size),
    },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    console.error('Google Drive replace failed', { status: res.status, error: data?.error?.message || data?.error });
    throw new Error('GOOGLE_DRIVE_REPLACE_FAILED');
  }

  if (fileName) {
    const renamed = await driveJson(`files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,modifiedTime,appProperties`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName }),
    });
    return renamed;
  }

  return data;
}

async function handleUpload(actor: Actor, req: Request) {
  const form = await req.formData();
  const category = String(form.get('category') || '');
  const requestedRole = String(form.get('role') || '');
  const requestedId = String(form.get('personId') || '');
  const replaceExisting = String(form.get('replaceExisting') || '').toLowerCase() === 'true';
  const fileValue = form.get('file');

  if (!(fileValue instanceof File)) throw new Error('FILE_REQUIRED');
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error('INVALID_CATEGORY');

  const person = await resolveTarget(actor, requestedRole, requestedId);
  if (actor.role === 'student' || actor.role === 'teacher' || actor.role === 'helper') {
    if (person.id !== (await resolveSelfPerson(actor)).id) throw new Error('FORBIDDEN');
  } else {
    const permission =
      person.role === 'student' ? 'students.manage' :
      person.role === 'teacher' ? 'teachers.manage' :
      'staff.manage';
    if (!can(actor, permission)) throw new Error('FORBIDDEN');
  }

  if (!categoryAllowedForRole(person.role, category)) throw new Error('CATEGORY_NOT_ALLOWED');

  const ext = extOf(fileValue.name);
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(String(fileValue.type || '').toLowerCase())) throw new Error('INVALID_FILE_TYPE');
  if (fileValue.size <= 0 || fileValue.size > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
  await validateImageSignature(fileValue);

  const year = new Date().getFullYear();
  const { personFolder } = await ensurePersonFolder(person, year);
  const existing = await listDriveDocuments(person, year);
  const sameCategory = existing.filter((item) => item.category === category);

  if (sameCategory.length > 0 && ['profile_picture', 'birth_registration', 'nid'].includes(category)) {
    if (!replaceExisting) throw new Error('DOCUMENT_ALREADY_EXISTS');
    const current = sameCategory.sort((a, b) => String(b.modifiedTime || b.createdTime || '').localeCompare(String(a.modifiedTime || a.createdTime || '')))[0];
    const newName = category === 'profile_picture'
      ? `profile.${ext === 'jpeg' ? 'jpg' : ext}`
      : normalizeFilename(fileValue.name);
    const updated = await replaceFileContent(current.fileId, fileValue, newName);
    return { ok: true, mode: 'replaced', file: await publicDocumentMetadata(updated) };
  }

  const fileName = category === 'profile_picture'
    ? `profile.${ext === 'jpeg' ? 'jpg' : ext}`
    : normalizeFilename(fileValue.name);

  const uploaded = await uploadNewFile(
    personFolder.id,
    fileValue,
    {
      qa_year: String(year),
      qa_role: person.role,
      qa_person_id: person.id,
      qa_person_code: person.code,
      qa_category: category,
      qa_doc_token: createDocumentToken(),
    },
    fileName,
  );

  return { ok: true, mode: 'created', file: await publicDocumentMetadata(uploaded) };
}

async function handleView(actor: Actor, documentToken: string) {
  const fileId = await resolveDocumentToken(documentToken);
  const meta = await getFileMetadata(fileId);
  const { category } = await authorizeFile(actor, meta, 'view');
  if (!ALLOWED_MIME.has(String(meta.mimeType || '').toLowerCase())) throw new Error('INVALID_FILE_TYPE');
  const res = await driveBinary(`files/${encodeURIComponent(fileId)}?alt=media`);
  const fileName = encodeURIComponent(String(meta.name || 'document'));
  return new Response(res.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': meta.mimeType,
      'Cache-Control': 'private, no-store',
      'X-File-Name': fileName,
    },
  });
}

async function handleDelete(actor: Actor, documentToken: string) {
  const fileId = await resolveDocumentToken(documentToken);
  const meta = await getFileMetadata(fileId);
  await authorizeFile(actor, meta, 'delete');
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Google Drive delete failed', { status: res.status, errorText: errorText.slice(0, 500) });
    throw new Error('GOOGLE_DRIVE_DELETE_FAILED');
  }
  return { ok: true };
}

async function handleProfileImage(actor: Actor, roleRaw: string, personIdRaw: string) {
  const person = await resolveAnyPerson(roleRaw, personIdRaw);
  if (!(await canViewProfileImage(actor, person))) throw new Error('FORBIDDEN');

  const q = [
    "trashed = false",
    `appProperties has { key='qa_app' and value='quraner-alo' }`,
    `appProperties has { key='qa_role' and value='${escapeDriveQueryLiteral(person.role)}' }`,
    `appProperties has { key='qa_person_id' and value='${escapeDriveQueryLiteral(person.id)}' }`,
    `appProperties has { key='qa_category' and value='profile_picture' }`,
  ].join(' and ');

  const data = await driveJson(`files?q=${encodeURIComponent(q)}&spaces=drive&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,mimeType,size,createdTime,modifiedTime,appProperties)`);
  const file = (data.files || [])[0];
  if (!file) return { ok: true, found: false, person: { role: person.role, id: person.id, code: person.code, name: person.name } };

  return {
    ok: true,
    found: true,
    person: { role: person.role, id: person.id, code: person.code, name: person.name },
    file: await publicDocumentMetadata(file),
  };
}

async function handleStorage(actor: Actor) {
  if (!(actor.role === 'owner' || actor.role === 'admin' || can(actor, 'settings.manage'))) {
    throw new Error('FORBIDDEN');
  }

  const data = await driveJson('about?fields=user(displayName,emailAddress),storageQuota');
  const quota = data.storageQuota || {};
  const total = Number(quota.limit || 0);
  const used = Number(quota.usage || 0);
  const inDrive = Number(quota.usageInDrive || used);
  const free = Math.max(total - used, 0);
  return {
    ok: true,
    totalBytes: total,
    usedBytes: used,
    driveUsedBytes: inDrive,
    freeBytes: free,
    usedPercent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : null,
    email: data.user?.emailAddress || '',
  };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    initSupabaseClients();
    const actor = await parseActor(req);
    const contentType = req.headers.get('content-type') || '';
    const body = contentType.includes('multipart/form-data')
      ? null
      : await req.json().catch(() => ({}));

    const action = String(body?.action || (contentType.includes('multipart/form-data') ? (await (async () => {
      const cloned = req.clone();
      const fd = await cloned.formData();
      return fd.get('action') || '';
    })()) : '')).toLowerCase();

    if (action === 'upload') return json(await handleUpload(actor, req));

    if (action === 'list') {
      const person = await resolveTarget(actor, body?.role, body?.personId);
      if (actor.role === 'student' || actor.role === 'teacher' || actor.role === 'helper') {
        const self = await resolveSelfPerson(actor);
        if (self.id !== person.id) throw new Error('FORBIDDEN');
      }
      const permission =
        person.role === 'student' ? 'students.view' :
        person.role === 'teacher' ? 'teachers.view' :
        'staff.view';
      if (actor.role !== person.role && !(can(actor, permission) || can(actor, permission.replace('.view', '.manage')))) {
        throw new Error('FORBIDDEN');
      }
      return json({ ok: true, person: { role: person.role, id: person.id, code: person.code, name: person.name }, files: await listPublicDriveDocuments(person) });
    }

    if (action === 'view') return await handleView(actor, String(body?.documentToken || ''));
    if (action === 'delete') return json(await handleDelete(actor, String(body?.documentToken || '')));
    if (action === 'profile_image') return json(await handleProfileImage(actor, String(body?.role || ''), String(body?.personId || '')));
    if (action === 'storage') return json(await handleStorage(actor));

    throw new Error('INVALID_ACTION');
  } catch (error) {
    console.error('portal-documents error', error);
    const code = error instanceof Error ? error.message : 'SERVER_ERROR';
    const serverErrors = new Set([
      'GOOGLE_AUTH_FAILED',
      'GOOGLE_DRIVE_API_ERROR',
      'GOOGLE_DRIVE_UPLOAD_FAILED',
      'GOOGLE_DRIVE_REPLACE_FAILED',
      'GOOGLE_DRIVE_DELETE_FAILED',
      'GOOGLE_DRIVE_NOT_CONFIGURED',
      'GOOGLE_DRIVE_CONFIG_INVALID',
      'SUPABASE_SERVER_KEY_NOT_CONFIGURED',
      'SUPABASE_CLIENT_KEY_NOT_CONFIGURED',
      'SUPABASE_URL_NOT_CONFIGURED',
      'SUPABASE_CLIENTS_NOT_INITIALIZED',
      'SUPABASE_FUNCTION_CONFIG_INVALID',
    ]);
    const status = ['UNAUTHORIZED', 'FORBIDDEN'].includes(code) ? 403 : serverErrors.has(code) ? 500 : 400;
    return json({ ok: false, error: code }, status);
  }
}
