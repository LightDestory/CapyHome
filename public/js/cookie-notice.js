'use strict';

window.CapyCookieNotice = (() => {
  const storageKey = 'capyhome.cookieNotice';
  const dismissedValue = 'dismissed';
  let sessionDismissed = false;

  function storageOrNull() {
    try { return window.localStorage; } catch { return null; }
  }

  function isDismissed(storage = storageOrNull()) {
    if (sessionDismissed) return true;
    if (!storage) return false;
    try { return storage.getItem(storageKey) === dismissedValue; } catch { return false; }
  }

  function dismiss(storage = storageOrNull()) {
    sessionDismissed = true;
    if (!storage) return;
    try { storage.setItem(storageKey, dismissedValue); } catch { /* The banner still closes for this page load. */ }
  }

  function show({ banner, storage = storageOrNull() } = {}) {
    if (!banner) return;
    banner.hidden = isDismissed(storage);
  }

  function init({ banner, closeButton, storage = storageOrNull() } = {}) {
    if (!banner || !closeButton) return;
    closeButton.addEventListener('click', () => {
      dismiss(storage);
      banner.hidden = true;
    });
    show({ banner, storage });
  }

  return { storageKey, isDismissed, dismiss, init, show };
})();
