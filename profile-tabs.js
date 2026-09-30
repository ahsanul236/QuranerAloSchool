// Move the existing cards, preserving nodes, listeners and form ownership.
export function initProfileTabs({formId, academicIds, documentsId}) {
  const form = document.getElementById(formId);
  const grid = form.querySelector('.profile-grid');
  const cards = [...grid.children].filter(node => node.classList.contains('profile-card'));
  // Staff markup keeps its status row inside the grid; keep it below all panels.
  const statusRow = [...grid.children].find(node => node.classList.contains('save-row'));
  if (statusRow) grid.after(statusRow);
  const sections = academicIds.length
    ? [['academic', 'একাডেমিক'], ['information', 'ইনফরমেশন'], ['documents', 'ডকুমেন্টস']]
    : [['information', 'ইনফরমেশন'], ['documents', 'ডকুমেন্টস']];
  const tabs = document.createElement('div');
  tabs.className = 'profile-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'প্রোফাইলের বিভাগ');
  grid.before(tabs);
  const panels = new Map(), buttons = new Map();
  for (const [key, label] of sections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `profile-tab-${key}`;
    button.className = 'profile-tab';
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `profile-panel-${key}`);
    const panel = document.createElement('section');
    panel.id = `profile-panel-${key}`;
    panel.className = 'profile-tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    tabs.append(button);
    grid.append(panel);
    panels.set(key, panel);
    buttons.set(key, button);
    button.addEventListener('click', () => activate(key));
  }
  for (const card of cards) {
    const key = card.id === documentsId ? 'documents'
      : academicIds.includes(card.id) ? 'academic' : 'information';
    panels.get(key).append(card);
  }
  function activate(key, focus = false) {
    for (const [name, button] of buttons) {
      const selected = name === key;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels.get(name).hidden = !selected;
    }
    if (focus) buttons.get(key).focus();
  }
  tabs.addEventListener('keydown', event => {
    const index = [...buttons.values()].indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length;
    activate(sections[next][0], true);
  });
  // Native validation must reveal fields in an inactive tab before focusing them.
  form.addEventListener('invalid', event => {
    const panel = event.target.closest('.profile-tab-panel');
    if (panel?.hidden) activate(panel.id.replace('profile-panel-', ''));
  }, true);
  activate(sections[0][0]);
}
