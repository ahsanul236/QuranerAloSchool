const MAX_DOCUMENT_BYTES = 500 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

const config = window.QURANER_ALO_CONFIG;

function endpoint() {
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
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('শুধু JPG, JPEG অথবা PNG ফাইল আপলোড করা যাবে।');
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('ফাইলের আকার সর্বোচ্চ 500 KB হতে পারবে।');
  }
  if (file.size <= 0) {
    throw new Error('খালি ফাইল আপলোড করা যাবে না।');
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
  validateDocumentFile(file);
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

export async function deleteDocument(fileId) {
  return requestJson({ action: 'delete', fileId });
}

export async function getStorage() {
  return requestJson({ action: 'storage' });
}

export async function getProfileImage({ role, personId }) {
  const data = await requestJson({ action: 'profile_image', role, personId });
  return data;
}

export async function fetchDocumentBlob(fileId) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: await sessionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'view', fileId })
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

export async function openDocument(fileId) {
  const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('ব্রাউজার নতুন window খুলতে বাধা দিয়েছে।');
  try {
    const result = await fetchDocumentBlob(fileId);
    const url = URL.createObjectURL(result.blob);
    popup.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    popup.close();
    throw error;
  }
}

export async function downloadDocument(fileId, filename = 'document') {
  const result = await fetchDocumentBlob(fileId);
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || result.filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
