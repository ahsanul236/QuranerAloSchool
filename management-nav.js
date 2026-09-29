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

  const QA_NON_SORTABLE = /^(action|actions|print|message|whatsapp|attendance|access|portal|save|edit|delete|remove)$/i;

  function qaSortValue(cell) {
    const raw=String(cell?.textContent||'').replace(/\s+/g,' ').trim();
    if(!raw||raw==='—')return {empty:true,value:''};
    const numeric=raw.replace(/[৳$,%\s]/g,'').replace(/,/g,'');
    if(/^-?\d+(?:\.\d+)?$/.test(numeric))return {empty:false,value:Number(numeric),numeric:true};
    if(/^\d{4}-\d{2}-\d{2}/.test(raw)){const t=Date.parse(raw);if(!Number.isNaN(t))return {empty:false,value:t,numeric:true};}
    return {empty:false,value:raw.toLocaleLowerCase(),numeric:false};
  }

  function qaSortTable(th) {
    const table=th.closest('table'), body=table?.tBodies?.[0];
    if(!table||!body)return;
    const headers=[...th.parentElement.children], index=headers.indexOf(th);
    const rows=[...body.rows];
    if(index<0||rows.length<2||rows.some(r=>!r.cells[index]||(r.cells.length===1&&r.cells[0].colSpan>1)))return;
    const direction=th.dataset.sortDirection==='asc'?'desc':'asc';
    headers.forEach(h=>{delete h.dataset.sortDirection;h.classList.remove('qa-sort-asc','qa-sort-desc');h.setAttribute('aria-sort','none');});
    th.dataset.sortDirection=direction;th.classList.add(direction==='asc'?'qa-sort-asc':'qa-sort-desc');th.setAttribute('aria-sort',direction==='asc'?'ascending':'descending');
    rows.sort((a,b)=>{const av=qaSortValue(a.cells[index]),bv=qaSortValue(b.cells[index]);if(av.empty&&!bv.empty)return 1;if(bv.empty&&!av.empty)return -1;let cmp;if(av.numeric&&bv.numeric)cmp=av.value-bv.value;else cmp=String(av.value).localeCompare(String(bv.value),undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?cmp:-cmp;});
    const frag=document.createDocumentFragment();rows.forEach(row=>frag.appendChild(row));body.appendChild(frag);
  }

  function qaSortableHeader(target) {
    const th=target.closest?.('table thead th');if(!th)return null;
    const label=String(th.textContent||'').trim();if(!label||QA_NON_SORTABLE.test(label))return null;
    return th;
  }

  function enableSafeTableSorting() {
    document.querySelectorAll('table thead th').forEach(th=>{if(qaSortableHeader(th)){th.classList.add('qa-sortable-th');th.setAttribute('aria-sort','none');}});
    document.addEventListener('click',event=>{const th=qaSortableHeader(event.target);if(!th)return;qaSortTable(th);});
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
    moreSheet.innerHTML=`<div class="management-more-handle"></div><div class="management-more-head"><strong>More</strong><button type="button" aria-label="Close more menu">×</button></div><a href="staff.html#teachers"><span>♟</span><strong>Staff</strong><small>Teacher & Helper</small></a><a href="payroll.html"><span>▣</span><strong>Expense</strong><small>Salary & Other Expense</small></a><a href="dashboard.html#settings"><span>⚙</span><strong>Settings</strong><small>Storage, Portal & Settings</small></a><button type="button" class="management-more-signout"><span>↪</span><strong>Sign out</strong><small>Securely leave management</small></button>`;
    document.body.appendChild(moreSheet);
    const moreBackdrop=document.createElement('div');moreBackdrop.className='management-more-backdrop';document.body.appendChild(moreBackdrop);
    const closeMore=()=>{moreSheet.classList.remove('is-open');moreBackdrop.classList.remove('is-visible');mobileBar.querySelector('.bottom-nav-more')?.setAttribute('aria-expanded','false')};
    mobileBar.querySelector('.bottom-nav-more').addEventListener('click',()=>{const open=!moreSheet.classList.contains('is-open');moreSheet.classList.toggle('is-open',open);moreBackdrop.classList.toggle('is-visible',open);mobileBar.querySelector('.bottom-nav-more').setAttribute('aria-expanded',String(open));});
    moreSheet.querySelector('.management-more-head button').addEventListener('click',closeMore);moreBackdrop.addEventListener('click',closeMore);moreSheet.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMore));moreSheet.querySelector('.management-more-signout').addEventListener('click',()=>{const existing=document.getElementById('signOut');if(existing){closeMore();existing.click();}});

    const topbar=document.querySelector('.topbar');
    if(topbar)topbar.classList.add('mobile-app-header');
    const mobileTabs=document.querySelector('.student-group-tabs');
    if(mobileTabs)mobileTabs.classList.add('mobile-header-tabs');

    const mobileSlideTargets=()=>{
      const map=[];
      const add=(triggerId,bodyId,title)=>{const trigger=document.getElementById(triggerId),body=document.getElementById(bodyId);if(trigger&&body)map.push({trigger,body,title});};
      add('toggleIncomeEntry','incomeEntryBody','নতুন Income');
      add('toggleManualVoucher','manualVoucherBody','Manual Voucher');
      add('togglePayrollEntry','payrollEntryBody','Monthly Salary Record');
      add('toggleExpenseEntry','expenseEntryBody','নতুন Expense');
      if(location.pathname.endsWith('dashboard.html')&&location.hash==='#settings'){
        document.querySelectorAll('#settingsView .settings-accordion').forEach(panel=>{const trigger=panel.querySelector('.settings-toggle-btn'),body=panel.querySelector('.settings-accordion-body'),title=panel.querySelector('.settings-accordion-title h2')?.textContent?.trim();if(trigger&&body)map.push({trigger,body,title:title||'Settings'});});
      }
      return map;
    };
    let activeSlide=null;
    const restoreMobileSlideOrigin=(slide)=>{
      if(!slide)return;
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:slide.scrollY,left:0,behavior:'instant'})));
    };
    const closeMobileSlide=(restore=true)=>{
      if(!activeSlide)return;
      const slide=activeSlide;activeSlide=null;
      slide.panel.classList.remove('mobile-slide-open');
      document.body.classList.remove('mobile-slide-active');
      slide.back.remove();
      slide.item.body.classList.add('hidden');
      slide.item.trigger.setAttribute('aria-expanded','false');
      if(restore)restoreMobileSlideOrigin(slide);
    };
    const openMobileSlide=(item)=>{
      if(innerWidth>620)return false;
      const panel=item.body.closest('.settings-accordion')||item.body.parentElement;
      if(!panel)return false;
      if(activeSlide)closeMobileSlide(false);
      const scrollY=window.scrollY;
      item.body.classList.remove('hidden');
      item.trigger.setAttribute('aria-expanded','true');
      panel.classList.add('mobile-slide-open');
      const back=document.createElement('button');back.type='button';back.className='mobile-slide-back';back.innerHTML='<span aria-hidden="true">‹</span><span>Back</span><strong>'+item.title+'</strong>';
      panel.prepend(back);
      document.body.classList.add('mobile-slide-active');
      history.pushState({...(history.state||{}),qaMobileSlide:true},'',location.href);
      activeSlide={panel,back,item,scrollY};
      back.addEventListener('click',()=>history.back());
      window.scrollTo({top:0,left:0,behavior:'instant'});
      return true;
    };
    window.addEventListener('popstate',()=>{if(activeSlide)closeMobileSlide(true);});
    const bindMobileSlides=()=>{
      mobileSlideTargets().forEach(item=>{
        if(item.trigger.dataset.mobileSlideBound)return;
        item.trigger.dataset.mobileSlideBound='1';
        const summary=item.trigger.closest('.settings-accordion-summary')||item.trigger.closest('.panel-head')||item.trigger.parentElement;
        if(summary){
          summary.classList.add('mobile-slide-summary-trigger');
          summary.setAttribute('role','button');
          summary.setAttribute('tabindex','0');
          const activate=(event)=>{
            if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
            if(event.target.closest('a,input,select,textarea,label')&&!event.target.closest('.settings-toggle-btn'))return;
            event.preventDefault();event.stopImmediatePropagation();
            if(innerWidth<=620){
              if(item.trigger.getAttribute('aria-expanded')!=='true')openMobileSlide(item);
            }else{
              const opening=item.trigger.getAttribute('aria-expanded')!=='true';
              item.body.classList.toggle('hidden',!opening);
              item.trigger.setAttribute('aria-expanded',String(opening));
              const caret=item.trigger.querySelector('[aria-hidden="true"]');
              if(caret)caret.textContent=opening?'⌃':'⌄';
            }
          };
          summary.addEventListener('click',activate,true);
          summary.addEventListener('keydown',activate,true);
        }else{
          item.trigger.addEventListener('click',(event)=>{if(innerWidth>620)return;if(item.trigger.getAttribute('aria-expanded')!=='true'){event.preventDefault();event.stopImmediatePropagation();openMobileSlide(item);}},true);
        }
      });
    };
    bindMobileSlides();window.addEventListener('hashchange',()=>{if(activeSlide)closeMobileSlide(false);setTimeout(bindMobileSlides,0)});

    const syncMobileActive=()=>{const key=currentKey();mobileBar.querySelectorAll('[data-mobile-key]').forEach(el=>el.classList.toggle('is-active',el.dataset.mobileKey===key||(el.dataset.mobileKey==='more'&&['staff','expense','settings'].includes(key))));};
    syncMobileActive();window.addEventListener('hashchange',syncMobileActive);
    enableSafeTableSorting();

    let lastY=window.scrollY, hidden=false;
    window.addEventListener('scroll',()=>{if(innerWidth>620)return;const y=window.scrollY;if(y<40||y<lastY-7){if(hidden){mobileBar.classList.remove('is-hidden');topbar?.classList.remove('is-mobile-hidden');mobileTabs?.classList.remove('is-mobile-hidden');hidden=false}}else if(y>lastY+9&&y>120){if(!hidden&&!moreSheet.classList.contains('is-open')&&!activeSlide){mobileBar.classList.add('is-hidden');topbar?.classList.add('is-mobile-hidden');mobileTabs?.classList.add('is-mobile-hidden');hidden=true}}lastY=y;},{passive:true});

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();