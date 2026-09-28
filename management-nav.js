(() => {
  const items = [
    ['Overview', 'dashboard.html#overview', 'overview', '⌂'],
    ['Students', 'students.html', 'students', '♙'],
    ['Staff', 'staff.html#teachers', 'staff', '♟'],
    ['Income', 'fees.html', 'income', '↗'],
    ['Expense', 'payroll.html', 'expense', '↘'],
    ['Vouchers', 'finance.html#vouchers', 'vouchers', '▤'],
    ['Settings', 'dashboard.html#settings', 'settings', '⚙']
  ];

  function currentKey() {
    const path = location.pathname.split('/').pop() || 'dashboard.html';
    const hash = location.hash.replace('#', '');
    const hashView = location.hash.replace('#', '');
    if (path === 'dashboard.html' && hashView === 'settings') return 'settings';
    if (path === 'staff.html' || path === 'staff-profile.html') return 'staff';
    if (path === 'finance.html' && hash === 'expense') return 'expense';
    if (path === 'finance.html' && hash === 'vouchers') return 'vouchers';
    if (path === 'finance.html') return 'income';
    if (path === 'school-profile.html') return 'settings';
    return ({
      'students.html': 'students',
      'groups.html': 'groups',
      'student-profile.html': 'students',
      'fees.html': 'income',
      'attendance.html': 'attendance',
      'quran.html': 'quran',
      'payroll.html': 'expense',
      'class-sessions.html': 'attendance',
      'enrollments.html': 'students'
    })[path] || 'overview';
  }

  function closeMobile() {
    document.querySelector('.management-sidebar')?.classList.remove('is-open');
    document.querySelector('.management-nav-backdrop')?.classList.remove('is-visible');
    const toggle = document.querySelector('.management-mobile-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
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

    const mobileBar = document.createElement('nav');
    mobileBar.className = 'management-bottom-nav';
    mobileBar.setAttribute('aria-label','Mobile management navigation');
    mobileBar.innerHTML = `
      <a href="students.html" data-mobile-key="students"><span class="bottom-nav-icon">♟</span><span>Students</span></a>
      <a href="fees.html" data-mobile-key="income"><span class="bottom-nav-icon">▥</span><span>Income</span></a>
      <a href="dashboard.html#overview" data-mobile-key="overview"><span class="bottom-nav-icon">⌂</span><span>Overview</span></a>
      <a href="finance.html#vouchers" data-mobile-key="vouchers"><span class="bottom-nav-icon">▤</span><span>Vouchers</span></a>
      <button type="button" class="bottom-nav-more" data-mobile-key="more" aria-expanded="false"><span class="bottom-nav-icon">•••</span><span>More</span></button>
    `;
    document.body.appendChild(mobileBar);

    const moreSheet=document.createElement('div');
    moreSheet.className='management-more-sheet';
    moreSheet.innerHTML=`<div class="management-more-handle"></div><div class="management-more-head"><strong>More</strong><button type="button" aria-label="Close more menu">×</button></div><a href="staff.html#teachers"><span>♟</span><strong>Staff</strong><small>Teacher & Helper</small></a><a href="payroll.html"><span>▣</span><strong>Expense</strong><small>Salary & Other Expense</small></a><a href="dashboard.html#settings"><span>⚙</span><strong>Settings</strong><small>Storage, Portal & Settings</small></a>`;
    document.body.appendChild(moreSheet);
    const moreBackdrop=document.createElement('div');moreBackdrop.className='management-more-backdrop';document.body.appendChild(moreBackdrop);
    const closeMore=()=>{moreSheet.classList.remove('is-open');moreBackdrop.classList.remove('is-visible');mobileBar.querySelector('.bottom-nav-more')?.setAttribute('aria-expanded','false')};
    mobileBar.querySelector('.bottom-nav-more').addEventListener('click',()=>{const open=!moreSheet.classList.contains('is-open');moreSheet.classList.toggle('is-open',open);moreBackdrop.classList.toggle('is-visible',open);mobileBar.querySelector('.bottom-nav-more').setAttribute('aria-expanded',String(open));});
    moreSheet.querySelector('button').addEventListener('click',closeMore);moreBackdrop.addEventListener('click',closeMore);moreSheet.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMore));

    const syncMobileActive=()=>{const key=currentKey();mobileBar.querySelectorAll('[data-mobile-key]').forEach(el=>el.classList.toggle('is-active',el.dataset.mobileKey===key||(el.dataset.mobileKey==='more'&&['staff','expense','settings'].includes(key))));};
    syncMobileActive();window.addEventListener('hashchange',syncMobileActive);
    let lastY=window.scrollY, hidden=false;
    window.addEventListener('scroll',()=>{if(innerWidth>620)return;const y=window.scrollY;if(y<40||y<lastY-7){if(hidden){mobileBar.classList.remove('is-hidden');hidden=false}}else if(y>lastY+9&&y>120){if(!hidden&&!moreSheet.classList.contains('is-open')){mobileBar.classList.add('is-hidden');hidden=true}}lastY=y;},{passive:true});

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();