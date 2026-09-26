(() => {
  const items = [
    ['Overview', 'dashboard.html#overview', 'overview', '⌂'],
    ['Students', 'students.html', 'students', '♙'],
    ['Teachers', 'staff.html#teachers', 'teachers', '♙'],
    ['Helpers', 'staff.html#helpers', 'helpers', '♟'],
    ['Fees', 'fees.html', 'fees', '৳'],
    ['Payroll', 'payroll.html', 'payroll', '▣'],
    ['Income', 'finance.html#income', 'income', '↗'],
    ['Expense', 'finance.html#expense', 'expense', '↘'],
    ['Vouchers', 'finance.html#vouchers', 'vouchers', '▤'],
    ['Settings', 'dashboard.html#settings', 'settings', '⚙']
  ];

  function currentKey() {
    const path = location.pathname.split('/').pop() || 'dashboard.html';
    const hash = location.hash.replace('#', '');
    const hashView = location.hash.replace('#', '');
    if (path === 'dashboard.html' && hashView === 'settings') return 'settings';
    if (path === 'staff.html' && hash === 'helpers') return 'helpers';
    if (path === 'staff.html') return 'teachers';
    if (path === 'staff-profile.html') return new URLSearchParams(location.search).get('type') === 'teacher' ? 'teachers' : 'helpers';
    if (path === 'finance.html' && hash === 'expense') return 'expense';
    if (path === 'finance.html' && hash === 'vouchers') return 'vouchers';
    if (path === 'finance.html') return 'income';
    if (path === 'school-profile.html') return 'settings';
    return ({
      'students.html': 'students',
      'student-profile.html': 'students',
      'fees.html': 'fees',
      'attendance.html': 'attendance',
      'quran.html': 'quran',
      'payroll.html': 'payroll',
      'class-sessions.html': 'attendance',
      'enrollments.html': 'students'
    })[path] || 'overview';
  }

  function closeMobile() {
    document.querySelector('.management-sidebar')?.classList.remove('is-open');
    document.querySelector('.management-nav-backdrop')?.classList.remove('is-visible');
  }

  function init() {
    if (document.body.classList.contains('management-layout')) return;
    document.body.classList.add('management-layout');

    const sidebar = document.createElement('aside');
    sidebar.className = 'management-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-scroll">
        <div class="sidebar-title">Management</div>
        <nav aria-label="Management navigation">
          ${items.map(([label, href, key, icon]) => `
            <a class="management-nav-link" data-nav-key="${key}" href="${href}">
              <span class="nav-icon" aria-hidden="true">${icon}</span>
              <span>${label}</span>
            </a>`).join('')}
        </nav>
      </div>
    `;
    document.body.appendChild(sidebar);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'management-mobile-toggle';
    toggle.setAttribute('aria-label', 'Open management navigation');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span aria-hidden="true">☰</span>';
    document.body.appendChild(toggle);

    const backdrop = document.createElement('div');
    backdrop.className = 'management-nav-backdrop';
    document.body.appendChild(backdrop);

    const syncActive = () => {
      const key = currentKey();
      sidebar.querySelectorAll('[data-nav-key]').forEach((link) => link.classList.toggle('is-active', link.dataset.navKey === key));
    };
    syncActive();
    sidebar.querySelectorAll('[data-nav-key]').forEach((link) => link.addEventListener('click', () => closeMobile()));
    window.addEventListener('hashchange', syncActive);

    toggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      backdrop.classList.toggle('is-visible', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    backdrop.addEventListener('click', closeMobile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();