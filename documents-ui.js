import {
  listDocuments, uploadDocument, deleteDocument, openDocument,
  fetchDocumentBlob, validateDocumentFile, fileSizeLabel, categoryLabel, getProfileImage
} from './documents-client.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }) : '—';
}

function categoriesForRole(role) {
  if (role === 'student') return [['profile_picture','Profile Picture'],['birth_registration','Birth Registration'],['other_document','Other Document']];
  return [['profile_picture','Profile Picture'],['nid','NID'],['other_document','Other Document']];
}

function buildMarkup(role, editable, title) {
  const options = categoriesForRole(role).map(([v,l]) => '<option value="'+v+'">'+l+'</option>').join('');
  return '' +
    '<div class="document-manager-head"><div><h3>'+esc(title || 'Documents')+'</h3><p class="document-manager-note">শুধু JPG, JPEG, PNG · সর্বোচ্চ 500 KB</p></div><span class="document-manager-badge">Private</span></div>' +
    (editable ? '<div class="document-manager-upload"><label class="document-upload-field">Document type<select data-document-category>'+options+'</select></label><label class="document-upload-field">File<input data-document-file type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png"></label><div class="document-upload-actions"><button data-document-upload class="primary-btn" type="button">Upload</button><span data-document-message class="message-inline"></span></div></div>' : '') +
    '<div data-document-profile class="document-profile-box hidden"><div class="document-profile-thumb"><img data-document-profile-img alt="Profile"></div><div><strong>Current Profile Picture</strong><span data-document-profile-meta class="muted">—</span></div></div>' +
    '<div data-document-list class="document-list"></div>';
}

function setMessage(node, text, type) {
  if (!node) return;
  node.textContent = text || '';
  node.className = ('message-inline '+(type || '')).trim();
}

export async function mountDocumentsPanel({ container, role, personId, editable=false, canDelete=false, title='Documents' } = {}) {
  if (!container) throw new Error('Document container পাওয়া যায়নি।');
  container.innerHTML = buildMarkup(role, editable, title);
  const categorySelect = container.querySelector('[data-document-category]');
  const fileInput = container.querySelector('[data-document-file]');
  const uploadBtn = container.querySelector('[data-document-upload]');
  const messageNode = container.querySelector('[data-document-message]');
  const listNode = container.querySelector('[data-document-list]');
  const profileBox = container.querySelector('[data-document-profile]');
  const profileImg = container.querySelector('[data-document-profile-img]');
  const profileMeta = container.querySelector('[data-document-profile-meta]');

  async function render() {
    const result = await listDocuments({ role, personId });
    const files = result.files || [];
    listNode.innerHTML = files.map((file) => {
      return '<div class="document-row"><div class="document-main"><span class="document-type">'+esc(categoryLabel(file.category))+'</span><strong>'+esc(file.name)+'</strong><small>'+esc(fileSizeLabel(file.size))+' · '+esc(dateLabel(file.modifiedTime || file.createdTime))+'</small></div><div class="document-actions"><button type="button" class="secondary-btn" data-view="'+esc(file.fileId)+'">View</button>'+(canDelete ? '<button type="button" class="danger-btn" data-delete="'+esc(file.fileId)+'">Delete</button>' : '')+'</div></div>';
    }).join('') || '<div class="document-empty">এখনো কোনো document upload করা হয়নি।</div>';

    listNode.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await openDocument(button.dataset.view); }
      catch (error) { setMessage(messageNode, error.message || 'Document view করা যায়নি।', 'error'); }
      finally { button.disabled = false; }
    }));

    listNode.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('এই document স্থায়ীভাবে মুছে ফেলতে চান?')) return;
      button.disabled = true;
      try { await deleteDocument(button.dataset.delete); setMessage(messageNode, 'Document সফলভাবে মুছে ফেলা হয়েছে।', 'success'); await render(); }
      catch (error) { setMessage(messageNode, error.message || 'Document delete করা যায়নি।', 'error'); button.disabled = false; }
    }));

    const profile = files.find((file) => file.category === 'profile_picture');
    if (profile) {
      profileBox?.classList.remove('hidden');
      profileMeta.textContent = fileSizeLabel(profile.size)+' · '+dateLabel(profile.modifiedTime || profile.createdTime);
      try {
        const blobResult = await fetchDocumentBlob(profile.fileId);
        const url = URL.createObjectURL(blobResult.blob);
        if (profileImg) profileImg.src = url;
      } catch (error) { console.warn('profile image preview unavailable', error); profileBox?.classList.add('hidden'); }
    } else {
      profileBox?.classList.add('hidden');
      if (profileImg) profileImg.removeAttribute('src');
    }
    return files;
  }

  uploadBtn?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    const category = categorySelect?.value || 'other_document';
    if (!file) { setMessage(messageNode, 'প্রথমে একটি ফাইল নির্বাচন করুন।', 'error'); return; }
    try {
      validateDocumentFile(file);
      const current = (await listDocuments({ role, personId })).files || [];
      const existing = current.filter((x) => x.category === category);
      let replaceExisting = false;
      if (existing.length && ['profile_picture','birth_registration','nid'].includes(category)) {
        replaceExisting = window.confirm(categoryLabel(category)+'-এর একটি file আগে থেকেই আছে।\n\nনতুন file দিয়ে বর্তমান file-এর content replace করতে চান?');
        if (!replaceExisting) {
          setMessage(messageNode, 'বর্তমান file অপরিবর্তিত রাখা হয়েছে। নতুন file upload করা হয়নি।');
          return;
        }
      }
      uploadBtn.disabled = true;
      setMessage(messageNode, 'Upload হচ্ছে…');
      await uploadDocument({ role, personId, category, file, replaceExisting });
      fileInput.value = '';
      setMessage(messageNode, replaceExisting ? 'Document update হয়েছে।' : 'Document সফলভাবে upload হয়েছে।', 'success');
      await render();
    } catch (error) {
      console.error('document upload error', error);
      setMessage(messageNode, error.message || 'Document upload করা যায়নি।', 'error');
    } finally { uploadBtn.disabled = false; }
  });

  return render();
}

export async function setProfileImage({ role, personId, img }) {
  if (!img) return false;
  try {
    const result = await getProfileImage({ role, personId });
    if (!result?.found || !result.file?.fileId) { img.classList.add('hidden'); return false; }
    const file = await fetchDocumentBlob(result.file.fileId);
    const url = URL.createObjectURL(file.blob);
    img.src = url;
    img.classList.remove('hidden');
    return true;
  } catch (error) {
    console.warn('profile image load failed', error);
    img.classList.add('hidden');
    return false;
  }
}
