(() => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const appBase = new URL('./', window.location.href);
    navigator.serviceWorker.register(new URL('service-worker.js', appBase), { scope: appBase.pathname })
      .catch(() => {});
  }, { once: true });
})();
