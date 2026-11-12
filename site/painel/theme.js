/* Apply the saved theme before the stylesheet and first paint. */
(function () {
  'use strict';
  var key = 'gal-pulse-theme';
  var root = document.documentElement;
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  var preference = null;
  function valid(value) { return value === 'light' || value === 'dark'; }
  try { var saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  function apply() {
    var theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#11151e' : '#f6f7fa';
    document.querySelectorAll('button[data-theme-value]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.themeValue === theme));
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('button[data-theme-value]');
    if (!button || !valid(button.dataset.themeValue)) return;
    preference = button.dataset.themeValue;
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  system.addEventListener('change', function () { if (!preference) apply(); });
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
})();
