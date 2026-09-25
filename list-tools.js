export function debounce(fn, wait = 350) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function populateYearSelect(select, label = 'সব বছর', yearsBack = 15) {
  if (!select) return;
  const current = new Date().getFullYear();
  const value = select.value;
  select.innerHTML = '<option value="">' + label + '</option>' +
    Array.from({ length: yearsBack + 1 }, (_, index) => current - index)
      .map((year) => '<option value="' + year + '">' + year + '</option>')
      .join('');
  if ([...select.options].some((option) => option.value === value)) select.value = value;
}

export function renderFilterChips(container, items, onClear) {
  if (!container) return;
  const active = items.filter((item) => String(item.value ?? '').trim() !== '');
  container.innerHTML = active.length
    ? '<span class="list-filter-chip-label">Active Filters:</span>' +
      active.map((item) => '<button type="button" class="list-filter-chip" data-filter-key="' +
        escapeAttr(item.key) + '">' + escapeHtml(item.label) + ': ' + escapeHtml(item.text) + ' <span aria-hidden="true">×</span></button>').join('') +
      '<button type="button" class="list-filter-clear" data-clear-all="true">সব ফিল্টার মুছুন</button>'
    : '';
  container.classList.toggle('is-empty', !active.length);
  container.querySelectorAll('[data-filter-key]').forEach((button) => {
    button.addEventListener('click', () => onClear(button.dataset.filterKey));
  });
  container.querySelector('[data-clear-all]')?.addEventListener('click', () => onClear('*'));
}

export function updatePager({ summaryEl, pageLabelEl, prevEl, nextEl, page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(Number(total || 0) / Number(pageSize || 10)));
  const safePage = Math.min(Math.max(1, page), pages);
  const from = total ? ((safePage - 1) * pageSize) + 1 : 0;
  const to = total ? Math.min(safePage * pageSize, total) : 0;
  if (summaryEl) summaryEl.textContent = total ? `${from}–${to} of ${total}` : '0 records';
  if (pageLabelEl) pageLabelEl.textContent = `${safePage} / ${pages}`;
  if (prevEl) prevEl.disabled = safePage <= 1;
  if (nextEl) nextEl.disabled = safePage >= pages;
  return { page: safePage, pages };
}

export function downloadCsv(filename, columns, rows) {
  const escapeCsv = (value) => {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsv(typeof column.value === 'function' ? column.value(row) : row[column.key])).join(',')
  ).join('\r\n');
  const blob = new Blob(['\uFEFF' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function bindColumnMenu({ button, menu, table }) {
  if (!button || !menu || !table) return;
  const sync = () => {
    menu.querySelectorAll('input[data-column]').forEach((input) => {
      const selector = `[data-col="${input.dataset.column}"]`;
      table.querySelectorAll(selector).forEach((cell) => cell.classList.toggle('list-column-hidden', !input.checked));
    });
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.classList.toggle('hidden');
  });
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.querySelectorAll('input[data-column]').forEach((input) => input.addEventListener('change', sync));
  document.addEventListener('click', () => menu.classList.add('hidden'));
  sync();
  return sync;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\s/g, '-');
}


const loadedScripts = new Map();

function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (loadedScripts.has(src)) return loadedScripts.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (globalName && !window[globalName]) {
        reject(new Error(globalName + ' did not load.'));
        return;
      }
      resolve(globalName ? window[globalName] : true);
    };
    script.onerror = () => reject(new Error('Unable to load export library.'));
    document.head.appendChild(script);
  });
  loadedScripts.set(src, promise);
  return promise;
}

function exportValue(column, row) {
  return typeof column.value === 'function' ? column.value(row) : row[column.key];
}

function fileBase(filename) {
  return String(filename || 'QuranerAlo_Export').replace(/\.(csv|xlsx|pdf)$/i, '');
}

function tableMarkup(title, columns, rows, note = '') {
  const head = columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('');
  const body = rows.length
    ? rows.map((row) => '<tr>' + columns.map((column) => '<td>' + escapeHtml(exportValue(column, row) ?? '') + '</td>').join('') + '</tr>').join('')
    : '<tr><td colspan="' + Math.max(1, columns.length) + '">No records found.</td></tr>';
  return `
    <section class="qa-export-document">
      <div class="qa-export-heading">
        <div>
          <div class="qa-export-brand">কোরআনের আলো · QURANER ALO</div>
          <h1>${escapeHtml(title || 'List Export')}</h1>
          ${note ? '<p>' + escapeHtml(note) + '</p>' : ''}
        </div>
        <div class="qa-export-date">${escapeHtml(new Date().toLocaleString('en-BD'))}</div>
      </div>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="qa-export-footer">Generated from Quraner Alo School Management System · ${rows.length} record${rows.length === 1 ? '' : 's'}</div>
    </section>
  `;
}

function exportStyles() {
  return `
    .qa-export-document{font-family:"Hind Siliguri","Noto Sans Bengali",Arial,sans-serif;color:#102a43;background:#fff;padding:20px}
    .qa-export-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:14px;margin-bottom:14px;border-bottom:2px solid #163a63}
    .qa-export-brand{font-size:12px;font-weight:800;color:#2e6ea8;letter-spacing:.02em}
    .qa-export-heading h1{margin:5px 0 2px;font-size:23px;line-height:1.2;color:#0b2342}
    .qa-export-heading p{margin:0;color:#5d7185;font-size:11px}
    .qa-export-date{font-size:10px;color:#718396;white-space:nowrap}
    .qa-export-document table{width:100%;border-collapse:collapse;font-size:10px}
    .qa-export-document th{background:#edf4fb;color:#143758;font-weight:800;text-align:left;border:1px solid #cfddeb;padding:7px}
    .qa-export-document td{border:1px solid #dce5ee;padding:6px;vertical-align:top}
    .qa-export-document tbody tr:nth-child(even){background:#fafcff}
    .qa-export-footer{margin-top:12px;padding-top:8px;border-top:1px solid #dce5ee;color:#718396;font-size:9px;text-align:right}
  `;
}

export async function downloadXlsx(filename, sheetName, columns, rows) {
  const XLSX = await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  const records = rows.map((row) => Object.fromEntries(columns.map((column) => [column.label, exportValue(column, row) ?? ''])));
  const worksheet = XLSX.utils.json_to_sheet(records.length ? records : [Object.fromEntries(columns.map((column) => [column.label, '']))]);
  worksheet['!cols'] = columns.map((column) => ({ wch: Math.min(38, Math.max(13, String(column.label).length + 5)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Export').slice(0, 31));
  XLSX.writeFile(workbook, fileBase(filename) + '.xlsx');
}

export async function downloadPdf(filename, title, columns, rows, note = '') {
  const html2pdf = await loadScriptOnce('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', 'html2pdf');
  await document.fonts?.ready;
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-100000px';
  holder.style.top = '0';
  holder.style.width = '1100px';
  holder.innerHTML = '<style>' + exportStyles() + '</style>' + tableMarkup(title, columns, rows, note);
  document.body.appendChild(holder);
  try {
    const options = {
      margin: [8, 7, 8, 7],
      filename: fileBase(filename) + '.pdf',
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 1.45, useCORS: true, logging: false, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: columns.length > 7 ? 'landscape' : 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] }
    };
    await html2pdf().set(options).from(holder.querySelector('.qa-export-document')).save();
  } finally {
    holder.remove();
  }
}

export function printRows(title, columns, rows, note = '') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title || 'Quraner Alo Export') + '</title><style>' +
    exportStyles() + '@page{margin:10mm;size:auto}body{margin:0;background:#fff}</style></head><body>' +
    tableMarkup(title, columns, rows, note) + '</body></html>');
  doc.close();
  const run = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1200);
    }
  };
  if (doc.readyState === 'complete') window.setTimeout(run, 100);
  else iframe.onload = () => window.setTimeout(run, 100);
}

export function bindExportMenu({ button, menu, onAction }) {
  if (!button || !menu || typeof onAction !== 'function') return;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.classList.toggle('hidden') === false;
    button.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', async (event) => {
    event.stopPropagation();
    const target = event.target.closest('[data-export-format]');
    if (!target) return;
    const format = target.dataset.exportFormat;
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    await onAction(format, target);
  });
  document.addEventListener('click', () => {
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  });
}
