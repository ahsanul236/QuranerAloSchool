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
      const selector = `[data-col="${CSS.escape(input.dataset.column)}"]`;
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
