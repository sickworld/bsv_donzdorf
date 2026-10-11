// Full current articles from the public feed, displayed with BSV branding.
(() => {
  const list = document.getElementById('news-list');
  if (!list) return;
  const status = document.getElementById('news-status');
  const more = document.getElementById('news-more');
  const retry = document.getElementById('news-retry');
  const dialog = document.getElementById('news-dialog');
  const articleTitle = document.getElementById('article-title');
  const articleMeta = document.getElementById('article-meta');
  const articleContent = document.getElementById('article-content');
  const api = 'https://staufen-events.de/wp-json/wp/v2/posts';
  const posts = new Map();
  const allowedTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BR', 'HR', 'BLOCKQUOTE', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'PRE', 'CODE', 'SUP', 'SUB']);
  const dropTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'VIDEO', 'AUDIO']);
  let page = 0;
  let totalPages = 1;
  let loading = false;
  let articleRequest = 0;
  let previousOverflow = '';
  let returnFocus = null;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function clubText(value, article = false) {
    const text = String(value || '')
      .replace(/(?:Euer|Dein)\s+(?:(?:Team\s+)?(?:von|vom)\s+)?Staufen\s+Events(?:[-\s]+Team)?/gi, 'Euer BSV-Team')
      .replace(/Staufen\s+Events/gi, 'BSV Donzdorf')
      .replace(/(?:https?:\/\/)?(?:www\.)?staufen-events\.de\/?/gi, 'bsv-donzdorf.de');
    // The closing line is shown once, below the complete article.
    return article ? text.replace(/(?:Euer|Dein)\s+(?:BSV[-\s]+Team|(?:Team\s+(?:von|vom)\s+)?BSV(?:\s+Donzdorf)?)/gi, '') : text;
  }

  function removeShortcodes(value) {
    return String(value || '').replace(/\[\/?(?:vc_[\w]+|caption|gallery|embed)(?:\s[^\]]*)?\]/gi, '');
  }

  function parse(value) {
    const template = document.createElement('template');
    template.innerHTML = removeShortcodes(value);
    return template.content;
  }

  function plainText(value) {
    const content = parse(value);
    content.querySelectorAll('script, style, iframe, object, template').forEach(node => node.remove());
    return clubText(content.textContent).replace(/\s+/g, ' ').trim();
  }

  function safeUrl(value, image = false) {
    try {
      const url = new URL(value, 'https://staufen-events.de/');
      if (image) return url.protocol === 'https:' && url.hostname === 'staufen-events.de' && !url.username && !url.password ? url.href : null;
      return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function localArticleLink(url) {
    const parsed = new URL(url);
    if (parsed.hostname !== 'staufen-events.de') return url;
    if (/^\/(?:aktuelles)?\/?$/.test(parsed.pathname)) return '#aktuelles';
    if (/^\/angebot\/bogenparcour\/?$/.test(parsed.pathname)) return '#parcours';
    if (/^\/(?:kontakt|angebot\/bogenverleih|agb)\/?$/.test(parsed.pathname)) return '#besuch';
    if (/^\/impressum\/?$/.test(parsed.pathname)) return 'impressum.html';
    if (/^\/datenschutz\/?$/.test(parsed.pathname)) return 'datenschutz.html';
    const match = parsed.pathname.match(/^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/);
    if (!match) return '#aktuelles';
    const post = [...posts.values()].find(item => item.slug === match[1]);
    return post ? `#artikel-${post.id}` : `#artikel-slug-${match[1]}`;
  }

  // Rebuild trusted markup instead of inserting remote HTML or attributes.
  function articleMarkup(value) {
    const source = parse(value);
    const output = document.createDocumentFragment();
    function copy(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(clubText(node.textContent, true))); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || dropTags.has(node.tagName)) return;
      if (!allowedTags.has(node.tagName)) { node.childNodes.forEach(child => copy(child, parent)); return; }
      const tag = /^H[1-6]$/.test(node.tagName) ? (node.tagName === 'H1' ? 'h3' : node.tagName === 'H2' ? 'h3' : 'h4') : node.tagName.toLowerCase();
      const clean = element(tag);
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        const url = href && safeUrl(href);
        if (url) {
          clean.href = localArticleLink(url);
          if (clean.getAttribute('href').startsWith('http')) { clean.target = '_blank'; clean.rel = 'noopener noreferrer'; }
        }
      }
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src');
        const url = src && safeUrl(src, true);
        if (!url) return;
        clean.src = url;
        clean.alt = node.getAttribute('alt') || '';
        clean.loading = 'lazy';
        clean.decoding = 'async';
        clean.referrerPolicy = 'no-referrer';
      }
      if (['TD', 'TH'].includes(node.tagName)) {
        for (const name of ['colspan', 'rowspan']) {
          const span = Number(node.getAttribute(name));
          if (Number.isInteger(span) && span > 0 && span <= 20) clean.setAttribute(name, String(span));
        }
      }
      node.childNodes.forEach(child => copy(child, clean));
      // WP builder wrappers can leave empty paragraphs or repeat the title.
      if (node.tagName === 'P' && !clean.textContent.trim() && !clean.querySelector('img')) return;
      if (node.tagName === 'H1' && plainText(node.innerHTML) === articleTitle.textContent) return;
      parent.append(clean);
    }
    source.childNodes.forEach(node => copy(node, output));
    return output;
  }

  function dateLabel(post) {
    const day = String(post.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
    const date = new Date(`${day}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  function imageInfo(post, full = false) {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    if (!media) return null;
    const sizes = media.media_details?.sizes || {};
    const url = safeUrl((full ? media.source_url : sizes.medium_large?.source_url || sizes.medium?.source_url || media.source_url) || '', true);
    return url ? { url, alt: plainText(media.alt_text) } : null;
  }

  function postImage(info, className) {
    const img = element('img', className);
    img.src = info.url;
    img.alt = info.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
  }

  function renderCard(post) {
    const card = element('article', 'news-card');
    const link = element('a', 'news-card-link');
    link.href = `#artikel-${post.id}`;
    const image = imageInfo(post);
    const visual = element('div', 'news-card-visual');
    if (image) visual.append(postImage(image));
    else visual.append(element('span', 'news-card-placeholder', 'Neues aus dem Parcours'));
    const body = element('div', 'news-card-body');
    const meta = element('p', 'meta');
    const time = element('time', '', dateLabel(post));
    time.dateTime = String(post.date || '').slice(0, 10);
    meta.append(time);
    const title = element('h3', '', plainText(post.title?.rendered) || 'Neuigkeiten');
    const excerpt = plainText(post.excerpt?.rendered);
    body.append(meta, title, element('p', 'news-excerpt', excerpt.length > 190 ? `${excerpt.slice(0, 187).replace(/\s+\S*$/, '')} …` : excerpt));
    body.append(element('span', 'inline-link', 'Artikel lesen →'));
    link.append(visual, body);
    card.append(link);
    list.append(card);
  }

  function validPost(post) {
    return post && Number.isSafeInteger(post.id) && post.id > 0 && typeof post.title?.rendered === 'string' && typeof post.content?.rendered === 'string' && !post.content.protected;
  }

  async function fetchPosts(parameters = {}, id = '') {
    const url = new URL(id ? `${api}/${id}` : api);
    url.search = new URLSearchParams({ _embed: 'wp:featuredmedia', _fields: 'id,date,slug,title,excerpt,content,_links,_embedded', ...parameters });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Artikel konnten nicht geladen werden.');
      return { data: await response.json(), total: Number(response.headers.get('X-WP-TotalPages')) || 1 };
    } finally { window.clearTimeout(timer); }
  }

  async function loadMore() {
    if (loading) return;
    loading = true;
    list.setAttribute('aria-busy', 'true');
    more.disabled = true;
    retry.hidden = true;
    status.textContent = page ? 'Weitere Neuigkeiten werden geladen …' : 'Neuigkeiten werden geladen …';
    try {
      const result = await fetchPosts({ per_page: '6', page: String(page + 1), orderby: 'date', order: 'desc' });
      if (!Array.isArray(result.data)) throw new Error('Ungültige Artikelliste.');
      const articles = result.data.filter(validPost);
      if (result.data.length && !articles.length) throw new Error('Keine lesbaren Artikel.');
      articles.forEach(post => { if (!posts.has(post.id) || !list.querySelector(`[href="#artikel-${post.id}"]`)) renderCard(post); posts.set(post.id, post); });
      page += 1;
      totalPages = result.total;
      more.hidden = page >= totalPages;
      status.textContent = list.children.length ? '' : 'Aktuell gibt es keine Neuigkeiten.';
    } catch {
      status.textContent = page ? 'Weitere Artikel konnten gerade nicht geladen werden. Bitte versuche es erneut.' : 'Die Neuigkeiten sind gerade nicht erreichbar. Bitte versuche es erneut.';
      retry.hidden = false;
      more.hidden = true;
    } finally {
      loading = false;
      more.disabled = false;
      list.setAttribute('aria-busy', 'false');
    }
  }

  function renderArticle(post) {
    articleTitle.textContent = plainText(post.title.rendered);
    articleMeta.textContent = `${dateLabel(post)} · BSV DONZDORF`;
    articleContent.replaceChildren();
    const image = imageInfo(post, true);
    if (image) articleContent.append(postImage(image, 'article-image'));
    articleContent.append(articleMarkup(post.content.rendered));
  }

  async function routeArticle() {
    const request = ++articleRequest;
    const match = window.location.hash.match(/^#artikel-(\d+|slug-([^/]+))$/);
    if (!match) { if (dialog.open) dialog.close(); return; }
    if (!dialog.open) {
      returnFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
    }
    dialog.scrollTop = 0;
    articleTitle.textContent = 'Artikel wird geladen …';
    articleMeta.textContent = 'BSV DONZDORF';
    articleContent.replaceChildren();
    try {
      let post = match[2] ? [...posts.values()].find(item => item.slug === match[2]) : posts.get(Number(match[1]));
      if (!post) {
        const result = match[2] ? await fetchPosts({ slug: match[2], per_page: '1' }) : await fetchPosts({}, match[1]);
        post = Array.isArray(result.data) ? result.data[0] : result.data;
      }
      if (request !== articleRequest || !dialog.open) return;
      if (!validPost(post)) throw new Error('Artikel nicht verfügbar.');
      posts.set(post.id, post);
      renderArticle(post);
    } catch {
      if (request !== articleRequest || !dialog.open) return;
      articleTitle.textContent = 'Artikel gerade nicht verfügbar';
      articleContent.append(element('p', '', 'Dieser Artikel konnte nicht geladen werden. Bitte versuche es noch einmal.'));
      const button = element('button', 'inline-link', 'Erneut versuchen ↻');
      button.type = 'button';
      button.addEventListener('click', routeArticle);
      articleContent.append(button);
    }
  }

  dialog.addEventListener('close', () => {
    ++articleRequest;
    document.body.style.overflow = previousOverflow;
    if (window.location.hash.startsWith('#artikel-')) history.replaceState(null, '', '#aktuelles');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  more.addEventListener('click', loadMore);
  retry.addEventListener('click', loadMore);
  window.addEventListener('hashchange', routeArticle);
  loadMore();
  routeArticle();
})();
