import { getStorage, bytesToHuman } from './documents-client.js';

function $(id) { return document.getElementById(id); }

async function init() {
  const box = $('googleDriveStorageCard');
  if (!box) return;
  try {
    const data = await getStorage();
    box.classList.remove('hidden');
    $('googleDriveStorageStatus').textContent = 'Connected';
    $('googleDriveStorageUsed').textContent = bytesToHuman(data.usedBytes);
    $('googleDriveStorageFree').textContent = data.totalBytes ? bytesToHuman(data.freeBytes) : '—';
    $('googleDriveStorageTotal').textContent = data.totalBytes ? bytesToHuman(data.totalBytes) : '—';
    $('googleDriveStoragePercent').textContent = data.usedPercent == null ? '—' : data.usedPercent+'%';
    $('googleDriveStorageBar').style.width = data.usedPercent == null ? '0%' : Math.min(100, Math.max(0, data.usedPercent))+'%';
  } catch (error) {
    console.warn('Google Drive storage unavailable', error);
    box.classList.remove('hidden');
    $('googleDriveStorageStatus').textContent = error?.message === 'GOOGLE_DRIVE_NOT_CONFIGURED' || error?.message === 'GOOGLE_DRIVE_CONFIG_INVALID' ? 'Not configured' : 'Unavailable';
    $('googleDriveStorageUsed').textContent = '—';
    $('googleDriveStorageFree').textContent = '—';
    $('googleDriveStorageTotal').textContent = '—';
    $('googleDriveStoragePercent').textContent = '—';
    $('googleDriveStorageBar').style.width = '0%';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
