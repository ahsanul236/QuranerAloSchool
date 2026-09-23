const MAX_DOCUMENT_BYTES = 250 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

const config = window.QURANER_ALO_CONFIG;

function endpoint() {
  if (location.hostname.endsWith('.vercel.app')) return '/api/portal-documents';
  if (!config?.supabaseUrl) throw new Error('Supabase configuration পাওয়া যায়নি।');
  return `${config.supabaseUrl}/functions/v1/portal-documents`;
}

function extensionOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function validateDocumentFile(file) {
  if (!file) throw new Error('একটি ফাইল নির্বাচন করুন।');
  const ext = extensionOf(file.name);
  const mime = String(file.type || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error('শুধু JPG, JPEG অথবা PNG ফাইল আপলোড করা যাবে।');
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('ফাইলের আকার সর্বোচ্চ 250 KB হতে পারবে।');
  }
  if (file.size <= 0) {
    throw new Error('খালি ফাইল আপলোড করা যাবে না।');
  }
  return true;
}

export async function validateDocumentFileContent(file) {
  validateDocumentFile(file);
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const mime = String(file.type || '').toLowerCase();
  if ((mime === 'image/jpeg' && !isJpeg) || (mime === 'image/png' && !isPng)) {
    throw new Error('ফাইলের প্রকৃত ধরন JPG/JPEG/PNG-এর সাথে মিলছে না।');
  }
  return true;
}

async function sessionHeaders(extra = {}) {
  const { data: { session } } = await supabaseAuthSession();
  if (!session?.access_token) throw new Error('Login session পাওয়া যায়নি।');
  return {
    ...extra,
    Authorization: `Bearer ${session.access_token}`,
    apikey: config.supabasePublishableKey
  };
}

async function supabaseAuthSession() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  return supabase.auth.getSession();
}

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'আপনার লগইন session বৈধ নয়। আবার login করুন।',
  FORBIDDEN: 'আপনার এই document-এর জন্য প্রয়োজনীয় অনুমতি নেই।',
  FILE_REQUIRED: 'প্রথমে একটি ফাইল নির্বাচন করুন।',
  FILE_TOO_LARGE: 'ফাইলের আকার সর্বোচ্চ 250 KB হতে পারবে।',
  INVALID_FILE_TYPE: 'শুধু JPG, JPEG অথবা PNG ফাইল গ্রহণ করা যাবে।',
  CATEGORY_NOT_ALLOWED: 'এই document type এই profile-এর জন্য অনুমোদিত নয়।',
  DOCUMENT_ALREADY_EXISTS: 'এই document type-এর একটি file আগে থেকেই আছে। নতুন file দিয়ে replace করার অনুমতি দিন।',
  GOOGLE_DRIVE_NOT_CONFIGURED: 'Google Drive সংযোগ এখনও কনফিগার করা হয়নি।',
  GOOGLE_DRIVE_CONFIG_INVALID: 'Google Drive configuration সঠিক নয়।',
  GOOGLE_AUTH_FAILED: 'Google Drive authorization সম্পন্ন হয়নি বা মেয়াদ শেষ হয়েছে।',
  GOOGLE_DRIVE_API_ERROR: 'Google Drive-এর সাথে যোগাযোগ করা যাচ্ছে না।',
  GOOGLE_DRIVE_UPLOAD_FAILED: 'Google Drive-এ file upload করা যায়নি।',
  GOOGLE_DRIVE_REPLACE_FAILED: 'Google Drive-এর existing file update করা যায়নি।',
  GOOGLE_DRIVE_DELETE_FAILED: 'Google Drive থেকে file মুছে ফেলা যায়নি।',
  INVALID_DOCUMENT_TOKEN: 'Document link আর বৈধ নেই। Document list নতুন করে খুলুন।',
  INVALID_ACTION: 'Document request সঠিক নয়।'
};

export function documentErrorMessage(error) {
  const code = error?.message || '';
  return ERROR_MESSAGES[code] || code || 'Document request সম্পন্ন করা যায়নি।';
}

async function requestJson(body) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: await sessionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `DOCUMENT_REQUEST_FAILED_${res.status}`);
  }
  return data;
}

export async function listDocuments({ role, personId }) {
  return requestJson({ action: 'list', role, personId });
}

export async function uploadDocument({ role, personId, category, file, replaceExisting = false }) {
  await validateDocumentFileContent(file);
  const form = new FormData();
  form.append('action', 'upload');
  if (role) form.append('role', role);
  if (personId) form.append('personId', personId);
  form.append('category', category);
  form.append('replaceExisting', replaceExisting ? 'true' : 'false');
  form.append('file', file, file.name);
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: await sessionHeaders(),
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `DOCUMENT_UPLOAD_FAILED_${res.status}`);
  }
  return data;
}

export async function deleteDocument(documentToken) {
  return requestJson({ action: 'delete', documentToken });
}

export async function getStorage() {
  return requestJson({ action: 'storage' });
}

export async function getProfileImage({ role, personId }) {
  const data = await requestJson({ action: 'profile_image', role, personId });
  return data;
}

export async function fetchDocumentBlob(documentToken) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: await sessionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'view', documentToken })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `DOCUMENT_VIEW_FAILED_${res.status}`);
  }
  return {
    blob: await res.blob(),
    filename: decodeURIComponent(res.headers.get('X-File-Name') || 'document'),
    contentType: res.headers.get('Content-Type') || 'application/octet-stream'
  };
}

export async function openDocument(documentToken) {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('ব্রাউজার নতুন window খুলতে বাধা দিয়েছে।');
  try { popup.opener = null; } catch {}
  try {
    const result = await fetchDocumentBlob(documentToken);
    const url = URL.createObjectURL(result.blob);
    popup.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    popup.close();
    throw error;
  }
}

export function bytesToHuman(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function fileSizeLabel(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}

export function categoryLabel(category) {
  return ({
    profile_picture: 'Profile Picture',
    birth_registration: 'Birth Registration',
    nid: 'NID',
    other_document: 'Other Document'
  })[category] || category;
}

export function isImageMime(mime) {
  return ALLOWED_MIME_TYPES.has(String(mime || '').toLowerCase());
}

export { MAX_DOCUMENT_BYTES };
