(function () {
  var theme = 'system';
  try {
    var saved = localStorage.getItem('law-writer-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (_) {}
  var dark = theme === 'dark' || theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', !!dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b1020' : '#4f46e5');
}());
