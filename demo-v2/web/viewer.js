/* Disposable presentation: the original Markdown remains the persisted result.
 * Marked 17.0.5 parses Markdown. No raw HTML, remote images, or executable links.
 */
(() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const renderer = new marked.Renderer();
  renderer.html = token => escape(token.text);
  renderer.image = token => escape(`![${token.text}](${token.href})`);
  const parser = new marked.Marked({gfm: true, breaks: false, renderer});
  const allowed = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','LI','PRE','CODE',
    'BLOCKQUOTE','STRONG','EM','DEL','TABLE','THEAD','TBODY','TR','TH','TD','HR','BR','A','INPUT']);
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
    if (!allowed.has(node.tagName)) return document.createTextNode(node.textContent);
    const result = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) || href.startsWith('#')) {
        result.setAttribute('href', href);
        result.setAttribute('rel', 'noopener noreferrer');
        result.setAttribute('target', '_blank');
      }
      if (node.hasAttribute('title')) result.title = node.getAttribute('title');
    }
    if (node.tagName === 'OL' && /^\d+$/.test(node.getAttribute('start') || '')) {
      result.setAttribute('start', node.getAttribute('start'));
    }
    if (node.tagName === 'INPUT') {
      result.type = 'checkbox'; result.disabled = true; result.checked = node.hasAttribute('checked');
    }
    for (const child of node.childNodes) result.appendChild(clean(child));
    return result;
  }
  window.renderCanonicalMarkdown = (markdown, target) => {
    const template = document.createElement('template');
    template.innerHTML = parser.parse(markdown);
    target.replaceChildren(...Array.from(template.content.childNodes, clean));
  };
})();
