import {getProfileImage,fetchDocumentBlob} from './documents-client.js';
import {t} from './ui-i18n.js?v=20261001-fixes2';
// Fetch only visible cards, share results across filtering and language changes.
const cache=new Map(),queue=[];let running=0;
function load(role,id){const key=role+':'+id;if(cache.has(key))return cache.get(key);const promise=new Promise(resolve=>{queue.push({role,id,resolve});drain()});cache.set(key,promise);return promise;}
function drain(){while(running<3&&queue.length){const {role,id,resolve}=queue.shift();running++;getProfileImage({role,personId:id}).then(async r=>r?.found&&r.file?.documentToken?URL.createObjectURL((await fetchDocumentBlob(r.file.documentToken)).blob):null).catch(()=>null).then(resolve).finally(()=>{running--;drain()});}}
const observer=new IntersectionObserver(entries=>{for(const {target,isIntersecting} of entries){if(!isIntersecting)continue;observer.unobserve(target);load(target.dataset.role,target.dataset.personId).then(url=>{if(!url||!target.isConnected)return;const img=document.createElement('img');img.src=url;img.alt=target.dataset.name;img.width=48;img.height=48;img.onload=()=>{target.replaceChildren(img);target.removeAttribute('aria-label')};});}},{rootMargin:'80px'});
export function cardPortrait(role,id,name){const box=document.createElement('div');box.className='qa-card-portrait';box.dataset.role=role;box.dataset.personId=id||'';box.dataset.name=name||'';box.setAttribute('aria-label',t('No profile photo'));box.textContent=String(name||'?').trim().slice(0,1);return box;}
export function observePortraits(root){observer.disconnect();root.querySelectorAll('.qa-card-portrait[data-person-id]').forEach(box=>{if(box.dataset.personId)observer.observe(box)});}
