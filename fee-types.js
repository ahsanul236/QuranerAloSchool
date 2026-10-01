import {t,locale} from './ui-i18n.js?v=20261001-fixes2';
export const feeCategories={monthly:'Monthly Fee',admission:'Admission Fee',sports:'Sports Fee',exam:'Exam Fee',materials:'Books / Materials',id_card:'ID Card Fee',event:'Event Fee',other:'Other Fee'};
export function feeLabel(charge){return charge?.fee_category==='other'?(charge.fee_name||t('Other Fee')):t(feeCategories[charge?.fee_category||'monthly']||'Other Fee');}
export function monthLabel(value){const [y,m]=String(value).slice(0,7).split('-').map(Number);return y&&m?new Date(y,m-1,1).toLocaleDateString(locale()==='bn'?'bn-BD':'en-GB',{month:'short',year:'numeric'}):String(value||'—');}
export function chargeLabel(charge){return feeLabel(charge)+' · '+monthLabel(charge.billing_month);}
