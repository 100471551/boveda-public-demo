(function () {
  'use strict';

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  const publicPages = new Set(['home', 'how-it-works', 'login', 'new', 'projects']);
  const auditSections = new Set(['overview', 'evidence', 'construction', 'signals', 'visuals']);
  let lastPath;

  window.va('beforeSend', function (event) {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return {...event, url: url.toString()};
  });

  function analyticsPath() {
    const parts = location.hash.slice(1).split('/');
    const page = parts[0] || 'home';
    if (page === 'audit') {
      const section = auditSections.has(parts[2]) ? parts[2] : 'overview';
      return `/audit/${section}`;
    }
    if (page === 'raw') return '/audit/canonical';
    if (page === 'project') return '/project';
    return `/${publicPages.has(page) ? page : 'home'}`;
  }

  function trackPage() {
    const path = analyticsPath();
    if (path === lastPath) return;
    lastPath = path;
    window.va('pageview', { path });
  }

  trackPage();
  window.addEventListener('hashchange', trackPage);
})();
