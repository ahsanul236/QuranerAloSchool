import {t,locale} from './ui-i18n.js';
import {renderFilterChips} from './list-tools.js?v=20260926-3';

const icons = {
  export:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  columns:'<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  filter:'<path d="M3 6h8m4 0h6M3 12h2m4 0h12M3 18h12m4 0h2"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'
};
function svg(key) {
  const node=document.createElementNS('http://www.w3.org/2000/svg','svg');
  node.setAttribute('viewBox','0 0 24 24');node.setAttribute('aria-hidden','true');
  node.setAttribute('fill','none');node.setAttribute('stroke','currentColor');
  node.setAttribute('stroke-width','2');node.setAttribute('stroke-linecap','round');
  node.setAttribute('stroke-linejoin','round');node.innerHTML=icons[key];return node;
}

// Reuse the same live controls and listeners; restore their positions above mobile width.
export function initMobileListTools(config) {
  const $=id=>document.getElementById(id);
  const grid=$(config.filters),toggle=$(config.toggle),search=$(config.search);
  const panel=grid.closest('.list-management-panel');
  const searchRow=search.closest('.list-search-row');
  const chips=config.chips?$(config.chips):grid.parentElement.querySelector('.list-filter-chips');
  const count=$(config.count),create=$(config.create),reset=$(config.reset);
  window.addEventListener('qa-language-change',sync);
  const media=matchMedia('(max-width:620px)');
  let toolbar=null,filterPanel=null,restores=[],iconRestores=[],lastGroupState='';
  const controls=[...grid.querySelectorAll('select')];
  function move(node,parent) {
    const marker=document.createComment('mobile-list-origin');node.before(marker);
    parent.append(node);restores.push(()=>marker.replaceWith(node));
  }
  function iconButton(button,key,label) {
    const old=[...button.childNodes],text=document.createElement('span');
    text.className='mobile-list-button-text';old.forEach(node=>text.append(node));
    const attrs=['aria-label','title','aria-controls'].map(name=>[name,button.getAttribute(name)]);
    button.append(svg(key),text);button.classList.add('mobile-list-icon-button');
    button.setAttribute('aria-label',label);button.title=label;
    iconRestores.push(()=>{
      button.replaceChildren(...old);button.classList.remove('mobile-list-icon-button');
      for(const [name,value] of attrs){if(value===null)button.removeAttribute(name);else button.setAttribute(name,value);}
    });
  }
  function groupItems() {
    return [{key:search.id,label:'Search',value:search.value,text:search.value},...controls.map(input=>({
      key:input.id,label:input.closest('label').firstChild.textContent.trim(),value:input.value,
      text:input.selectedOptions[0]?.textContent||''
    }))];
  }
  function sync() {
    if(!toolbar)return;
    const active=controls.filter(input=>input.value&&!input.closest('label').classList.contains('hidden')).length;
    const badge=toggle.querySelector('.mobile-list-filter-badge');
    badge.textContent=String(active);badge.hidden=!active;
    const open=grid.classList.contains('is-open');filterPanel.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-controls',grid.id);
    toggle.setAttribute('aria-label',`Filters${active?' · '+active+' active':''}`);
    create.dataset.label=locale()==='bn'?'+ নতুন':'+ New';const name=create.textContent.trim();create.setAttribute('aria-label',name);create.title=name;
    if(config.group){
      const items=groupItems(),state=JSON.stringify(items);
      if(state!==lastGroupState){
        lastGroupState=state;
        renderFilterChips(chips,items,key=>{
          if(key==='*'){reset.click();return;}
          const input=$(key);input.value='';input.dispatchEvent(new Event(input===search?'input':'change',{bubbles:true}));sync();
        });
      }
    }
  }
  function mount() {
    if(toolbar)return;
    toolbar=document.createElement('div');toolbar.className='mobile-list-toolbar';panel.prepend(toolbar);
    panel.classList.add('mobile-list-active');
    move(searchRow,toolbar);
    const originalClass=searchRow.className;searchRow.className='mobile-list-search';
    iconRestores.push(()=>{searchRow.className=originalClass;});
    const magnifier=svg('search');magnifier.classList.add('mobile-list-search-icon');search.parentElement.prepend(magnifier);
    iconRestores.push(()=>magnifier.remove());
    iconButton(toggle,'filter','Filters');
    const badge=document.createElement('span');badge.className='mobile-list-filter-badge';badge.setAttribute('aria-hidden','true');toggle.append(badge);
    const actions=document.createElement('div');actions.className='mobile-list-actions';toolbar.append(actions);
    for(const [id,key,label] of [[config.export,'export','Export'],[config.columns,'columns','Columns'],[config.reset,'reset','Reset Filters']]){
      const button=$(id),wrap=button.closest('.list-export-wrap,.list-column-wrap');move(wrap||button,actions);iconButton(button,key,label);
    }
    move(create,actions);create.classList.add('mobile-list-create');
    const createAttrs=['aria-label','title'].map(name=>[name,create.getAttribute(name)]);
    iconRestores.push(()=>{create.classList.remove('mobile-list-create');for(const [name,value] of createAttrs){if(value===null)create.removeAttribute(name);else create.setAttribute(name,value);}});
    filterPanel=document.createElement('section');filterPanel.className='mobile-list-filter-panel';filterPanel.setAttribute('aria-label','ফিল্টার');
    const head=document.createElement('div');head.className='mobile-list-filter-heading';
    const title=document.createElement('strong');title.textContent='ফিল্টার';
    const close=document.createElement('button');close.type='button';close.className='mobile-list-filter-close';close.textContent='×';close.setAttribute('aria-label','ফিল্টার বন্ধ করুন');close.title='ফিল্টার বন্ধ করুন';
    close.addEventListener('click',()=>{if(grid.classList.contains('is-open'))toggle.click();toggle.focus();});
    head.append(title,close);filterPanel.append(head);toolbar.append(filterPanel);
    move(grid,filterPanel);const gridClass=grid.className;
    grid.classList.remove('list-filter-grid','group-filter-bar');grid.classList.add('mobile-list-filter-grid');
    iconRestores.push(()=>{const open=grid.classList.contains('is-open');grid.className=gridClass;grid.classList.toggle('is-open',open);});
    const note=document.createElement('p');note.className='mobile-list-filter-note';note.textContent='অপশন বদলালেই তালিকা আপডেট হবে';filterPanel.append(note);
    move(chips,toolbar);chips.classList.add('mobile-list-chips');iconRestores.push(()=>chips.classList.remove('mobile-list-chips'));
    move(count,toolbar);count.classList.add('mobile-list-count');iconRestores.push(()=>count.classList.remove('mobile-list-count'));
    lastGroupState='';sync();
  }
  function unmount() {
    if(!toolbar)return;
    iconRestores.reverse().forEach(restore=>restore());restores.reverse().forEach(restore=>restore());
    toolbar.remove();toolbar=null;filterPanel=null;restores=[];iconRestores=[];
    panel.classList.remove('mobile-list-active');
    if(config.group){chips.replaceChildren();chips.classList.add('is-empty');}
  }
  const observer=new MutationObserver(sync);
  observer.observe(grid,{attributes:true,attributeFilter:['class'],subtree:true,childList:true});
  observer.observe(create,{childList:true,subtree:true});
  observer.observe(count,{childList:true});
  if(!config.group)observer.observe(chips,{childList:true});
  for(const input of [search,...controls])input.addEventListener(input===search?'input':'change',sync);
  reset.addEventListener('click',()=>queueMicrotask(sync));
  toggle.addEventListener('click',sync);
  media.addEventListener('change',()=>media.matches?mount():unmount());
  if(media.matches)mount();
}
