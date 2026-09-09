(() => {
  'use strict';

  const boundContainers = new WeakSet();
  const allowedSections = new Set(['overview', 'evidence', 'construction', 'visuals']);
  const allowedStatuses = new Set(['READY', 'PARTIAL']);
  const allowedKinds = new Set(['project_authored', 'boveda_computed']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function assetUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const origin = window.location.origin;
      const parsed = new URL(value, origin);
      const keys = [...parsed.searchParams.keys()];
      const audit = parsed.searchParams.get('audit');
      const asset = parsed.searchParams.get('asset');
      const exactKeys = keys.length === 2 && keys.includes('audit') && keys.includes('asset');
      if (parsed.origin !== origin || parsed.pathname !== '/api/visual-asset' || parsed.hash || parsed.username || parsed.password) return null;
      if (!exactKeys || !audit || !/^[a-f0-9]{64}$/i.test(asset || '')) return null;
      return `${parsed.pathname}?audit=${encodeURIComponent(audit)}&asset=${asset.toLowerCase()}`;
    } catch (_) {
      return null;
    }
  }

  function friendlyLocator(locator, path) {
    if (typeof locator !== 'string' || !locator || locator === path) return '';
    const notebook = locator.match(/#cell=(\d+)(?:\/output=(\d+))?(?:\/mime=.+)?$/);
    if (notebook) {
      const parts = [`Cell ${Number(notebook[1]) + 1}`];
      if (notebook[2] !== undefined) parts.push(`output ${Number(notebook[2]) + 1}`);
      return parts.join(' · ');
    }
    const savedImage = locator.match(/#data-uri=(\d+)$/);
    if (savedImage) return `Saved image ${Number(savedImage[1]) + 1}`;
    return locator;
  }

  function sourceList(sources) {
    const valid = Array.isArray(sources) ? sources.filter(source => source && typeof source.path === 'string' && source.path.trim()) : [];
    if (!valid.length) return '';
    return `<details class="visual-sources"><summary>Source${valid.length === 1 ? '' : 's'}</summary><ul>${valid.map(source => {
      const locator = friendlyLocator(source.locator, source.path);
      return `<li><span>${esc(source.path)}</span>${locator ? `<small>${esc(locator)}</small>` : ''}</li>`;
    }).join('')}</ul></details>`;
  }

  function chart(item) {
    if (!Array.isArray(item.series)) return '';
    const rows = item.series.filter(row => row && typeof row.label === 'string' && typeof row.value === 'number' && Number.isFinite(row.value));
    if (!rows.length) return '';
    const hasNegative = rows.some(row => row.value < 0);
    const minimum = hasNegative ? Math.min(0, ...rows.map(row => row.value)) : 0;
    const maximum = hasNegative ? Math.max(0, ...rows.map(row => row.value)) : Math.max(1, ...rows.map(row => row.value));
    const span = maximum - minimum || 1;
    const zero = (-minimum / span * 100).toFixed(3);
    const unit = typeof item.unit === 'string' ? item.unit : '';
    const metric = typeof item.metric === 'string' ? item.metric : '';
    const accessibleSummary = rows.map(row => `${row.label}: ${row.value}${unit ? ` ${unit}` : ''}`).join('; ');
    return `<div class="visual-chart" role="group" aria-label="${esc([[metric, unit].filter(Boolean).join(', '), accessibleSummary].filter(Boolean).join('. ') || 'Computed comparison')}">${metric ? `<p class="visual-metric">${esc(metric)}</p>` : ''}<div class="visual-chart-rows">${rows.map(row => {
      const start = row.value < 0 ? ((row.value - minimum) / span * 100).toFixed(3) : zero;
      const width = (Math.abs(row.value) / span * 100).toFixed(3);
      const exactValue = String(row.value);
      return `<div class="visual-chart-row"><div class="visual-chart-label"><span>${esc(row.label)}</span><strong>${esc(exactValue)}${unit ? ` <small>${esc(unit)}</small>` : ''}</strong></div><svg class="visual-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="visual-bar-track" x="0" y="0" width="100" height="8" rx="4"></rect><rect class="visual-bar-value" x="${start}" y="0" width="${width}" height="8" rx="4"></rect>${hasNegative ? `<line class="visual-bar-zero" x1="${zero}" y1="0" x2="${zero}" y2="8"></line>` : ''}</svg></div>`;
    }).join('')}</div></div>`;
  }

  function imageCollection(item) {
    const images = Array.isArray(item.images) ? item.images.map(image => {
      if (!image || typeof image.alt !== 'string') return null;
      const url = assetUrl(image.url);
      return url ? {url, alt: image.alt} : null;
    }).filter(Boolean) : [];
    if (!images.length) return '';
    return `<div class="visual-image-grid visual-image-count-${images.length}">${images.map((image, imageIndex) => `<button class="visual-thumbnail" type="button" data-visual-expand data-visual-url="${esc(image.url)}" data-visual-alt="${esc(image.alt)}" data-visual-title="${esc(item.title || 'Visual evidence')}" data-visual-caption="${esc(item.caption || '')}" aria-label="Enlarge ${esc(image.alt || `figure ${imageIndex + 1}`)}"><img src="${esc(image.url)}" alt="${esc(image.alt)}" loading="lazy" decoding="async"><span aria-hidden="true">Enlarge</span></button>`).join('')}</div>`;
  }

  function renderItem(item, index) {
    if (!item || !allowedKinds.has(item.kind) || typeof item.title !== 'string') return '';
    const images = imageCollection(item);
    const bars = item.kind === 'boveda_computed' ? chart(item) : '';
    if (!images && !bars) return '';
    const badge = item.kind === 'project_authored' ? 'Project-authored visual' : 'Bóveda-computed visual';
    return `<article class="visual-evidence-card visual-kind-${esc(item.kind)}"><div class="visual-card-tab">${item.kind === 'boveda_computed' ? 'Comparison' : item.images?.length > 1 ? 'Collection' : 'Figure'} ${String(index + 1).padStart(2, '0')}</div><div class="panel visual-card-surface">${images}${bars}<header class="visual-card-heading"><div class="visual-card-title"><h3>${esc(item.title)}</h3><span class="badge visual-origin-badge">${badge}</span></div>${item.caption ? `<p>${esc(item.caption)}</p>` : ''}</header>${item.caveat ? `<p class="visual-caveat"><img src="/product_v2_0_1/assets/purpose.svg" width="21" height="21" alt="">${esc(item.caveat)}</p>` : ''}${sourceList(item.sources)}</div></article>`;
  }

  function render(payload, section) {
    if (!payload || typeof payload !== 'object' || !allowedStatuses.has(payload.status) || !allowedSections.has(section) || !Array.isArray(payload.items)) return '';
    let imageCount = 0;
    const cards = payload.items.filter(item => item && (section === 'visuals' || item.section === section)).map((item, index) => {
      const supplied = Array.isArray(item.images) ? item.images : [];
      if (supplied.length > 3) return '';
      const images = supplied.map(image => {
        if (!image || typeof image.alt !== 'string') return null;
        const url = assetUrl(image.url);
        return url ? {...image, url} : null;
      });
      if (images.some(image => !image) || imageCount + images.length > 6) return '';
      imageCount += images.length;
      return renderItem({...item, images}, index);
    }).filter(Boolean);
    const gallery = section === 'visuals' ? renderGallery(payload.additional_images, payload.catalog_coverage) : '';
    if (!cards.length && !gallery) return '';
    return `<section class="visual-evidence" aria-labelledby="visual-evidence-title-${esc(section)}" data-visual-evidence-status="${esc(payload.status)}"><header class="visual-evidence-heading"><p class="eyebrow">Additional material</p><h2 id="visual-evidence-title-${esc(section)}">${cards.length ? 'Figures in context' : 'Project images'}</h2></header>${cards.length ? `<div class="visual-evidence-grid">${cards.join('')}</div>` : ''}${gallery}<dialog class="visual-dialog" aria-labelledby="visual-dialog-title-${esc(section)}"><div class="visual-dialog-frame"><header><div><p class="eyebrow">Visual evidence</p><h2 id="visual-dialog-title-${esc(section)}"></h2></div><button class="icon-button visual-dialog-close" type="button" data-visual-close aria-label="Close enlarged figure"><img src="/product/assets/close.svg" alt=""></button></header><figure><img alt=""><figcaption></figcaption></figure></div></dialog></section>`;
  }

  function renderGallery(records, coverage = {}) {
    if (!Array.isArray(records)) return '';
    const entries = records.slice(0, 500).map(item => {
      if (item?.kind !== 'source_image' || typeof item.title !== 'string' || item.images?.length !== 1) return '';
      const source = (item.sources || []).map(s => `${s.path}${friendlyLocator(s.locator, s.path) ? ` · ${friendlyLocator(s.locator, s.path)}` : ''}`).join('\n');
      const image = imageCollection({...item, caption: source});
      if (!image) return '';
      return `<article class="visual-source-image">${image}<h3>${esc(item.title)}</h3>${sourceList(item.sources)}</article>`;
    }).filter(Boolean);
    if (!entries.length) return '';
    const exclusions = coverage?.excluded || {};
    const omitted = Object.values(exclusions).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
    const skipped = Object.keys(coverage?.scan_skipped || {}).some(key => !['hidden_or_dependency_directory', 'hidden_file'].includes(key));
    const coverageNote = coverage?.scan_truncated || skipped || omitted ? '<p class="visual-catalog-coverage">Some images could not be included or were excluded as decorative assets. This gallery is not a complete file inventory.</p>' : '';
    return `<section class="panel visual-source-gallery" data-visual-gallery data-visual-total="${entries.length}" aria-label="Other source images"><header><h2>Other source images <span>${entries.length}</span></h2><p>Saved PNG and JPEG images from the project, including standalone files and notebook outputs. Their relationship to the audit has not been reviewed. Identical images appear once, including those shown above.</p>${coverageNote}</header><div class="visual-source-grid">${entries.slice(0, 24).join('')}</div>${entries.length > 24 ? `<template data-visual-page>${entries.slice(24).join('')}</template><footer><p data-visual-page-status aria-live="polite">Showing 24 of ${entries.length}</p><button type="button" class="secondary-button" data-visual-more>Show more images</button></footer>` : ''}</section>`;
  }

  function bind(container) {
    if (!container || boundContainers.has(container)) return;
    boundContainers.add(container);
    let returnFocus = null;
    const fitImage = image => {
      const frame = image.closest('.visual-thumbnail');
      if (!frame || !image.naturalWidth || !image.naturalHeight) return;
      const ratio = image.naturalWidth / image.naturalHeight;
      const computedMaxHeight = Number.parseFloat(getComputedStyle(image).maxHeight);
      const width = Math.min(frame.clientWidth, (Number.isFinite(computedMaxHeight) ? computedMaxHeight : Infinity) * ratio);
      const value = `${width}px`;
      if (image.style.width !== value) image.style.width = value;
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      container.querySelectorAll('.visual-thumbnail img').forEach(fitImage);
    }) : null;
    resizeObserver?.observe(container);
    container.addEventListener('load', event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches('.visual-thumbnail img')) return;
      fitImage(image);
    }, true);
    container.addEventListener('click', event => {
      const more = event.target.closest?.('[data-visual-more]');
      if (more && container.contains(more)) {
        const gallery = more.closest('[data-visual-gallery]');
        const pending = gallery.querySelector('template[data-visual-page]').content;
        const grid = gallery.querySelector('.visual-source-grid');
        const batch = Array.from(pending.children).slice(0, 24);
        batch.forEach(node => grid.appendChild(node));
        gallery.querySelector('[data-visual-page-status]').textContent = `Showing ${grid.children.length} of ${gallery.dataset.visualTotal}`;
        if (!pending.children.length) more.hidden = true;
        const first = batch[0]?.querySelector('button');
        first?.focus({preventScroll: true});
        return;
      }
      const expand = event.target.closest?.('[data-visual-expand]');
      if (expand && container.contains(expand)) {
        const url = assetUrl(expand.dataset.visualUrl);
        const dialog = expand.closest('.visual-evidence')?.querySelector('.visual-dialog');
        if (!url || !dialog || typeof dialog.showModal !== 'function') return;
        dialog.querySelector('figure img').src = url;
        dialog.querySelector('figure img').alt = expand.dataset.visualAlt || '';
        dialog.querySelector('h2').textContent = expand.dataset.visualTitle || 'Visual evidence';
        const caption = dialog.querySelector('figcaption');
        caption.textContent = expand.dataset.visualCaption || '';
        caption.hidden = !caption.textContent;
        returnFocus = expand;
        dialog.showModal();
        dialog.querySelector('[data-visual-close]')?.focus();
        return;
      }
      const close = event.target.closest?.('[data-visual-close]');
      if (close && container.contains(close)) close.closest('dialog')?.close();
    });
    container.addEventListener('close', event => {
      if (!event.target.matches?.('.visual-dialog')) return;
      const focusTarget = returnFocus;
      returnFocus = null;
      if (focusTarget?.isConnected) focusTarget.focus();
    }, true);
  }

  window.BovedaVisualEvidence = Object.freeze({render, bind});
})();
