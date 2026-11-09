// Black Box: hides empty boxes left behind in the X timeline
// (usually ads/promoted posts whose content was blocked), and optionally
// hides boosted/promoted posts themselves.
//
// Debug mode: in the x.com DevTools console run
//   localStorage.blackBoxDebug = '1'   then reload
// Tall cells that are kept get a red outline and a console log saying which
// element counted as "visible content". Turn it off with
//   localStorage.removeItem('blackBoxDebug')

(() => {
  const CELL = '[data-testid="cellInnerDiv"]';
  const HIDDEN = 'bb-empty-cell';
  const BOOSTED = 'bb-boosted';
  const MIN_GAP_PX = 40; // ignore thin divider cells
  const CONFIRM_MS = 600; // cell must stay empty this long before we collapse it
  // Elements that draw pixels without text. Links/buttons are left out because
  // they're often empty, transparent wrappers; their visible text/icons are
  // checked separately.
  const MEDIA = 'img, video, canvas, iframe, svg, [role="progressbar"], [style*="background-image"]';

  // Labels X puts on paid posts. Matched exactly, and never inside the post's
  // own text, author name or link card, so a tweet that just says "Ad" is safe.
  // Add translations here if you use X in another language.
  const BOOSTED_LABELS = new Set(['Ad', 'Promoted', 'Boosted']);
  const NOT_A_LABEL = '[data-testid="tweetText"], [data-testid="User-Name"], [data-testid="card.wrapper"]';

  const api = globalThis.browser ?? globalThis.chrome;
  const settings = { collapseEmpty: true, hideBoosted: false };

  let DEBUG = false;
  try {
    DEBUG = localStorage.getItem('blackBoxDebug') === '1';
  } catch {}

  const pending = new WeakMap(); // cell -> time it was first seen empty
  const reported = new WeakSet(); // cells already logged in debug mode

  function intersect(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  // Is `rect` (belonging to `el`) actually painted somewhere inside `cell`?
  // Walks up to the cell checking every ancestor for hiding styles and clipping,
  // because ad blockers often hide a wrapper rather than the content itself.
  function isPainted(el, rect, cell) {
    if (rect.width < 1 || rect.height < 1) return false;
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };

    const own = getComputedStyle(el);
    if (own.visibility !== 'visible') return false; // inherited, so own value is enough

    for (let node = el; node; node = node.parentElement) {
      const s = node === el ? own : getComputedStyle(node);
      if (s.display === 'none' || parseFloat(s.opacity) === 0) return false;
      if (s.clipPath && s.clipPath !== 'none') return false;
      if (node === cell) {
        // A cell we collapsed clips everything; judge it as if it were open.
        return cell.classList.contains(HIDDEN) || !!intersect(box, cell.getBoundingClientRect());
      }
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        box = intersect(box, node.getBoundingClientRect());
        if (!box) return false;
      }
    }
    return false; // detached from the cell
  }

  // Returns the first thing in the cell a person could actually see, or null.
  function findVisibleContent(cell) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.data.trim() || !t.parentElement) continue;
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (isPainted(t.parentElement, r, cell)) return t.parentElement;
      }
    }

    for (const el of cell.querySelectorAll(MEDIA)) {
      if (el.tagName === 'svg' && !el.querySelector('path, circle, rect, polygon, line, ellipse, image, text, use')) continue;
      if (isPainted(el, el.getBoundingClientRect(), cell)) return el;
    }
    return null;
  }

  // ---- Boosted posts ----------------------------------------------------
  // New X site: the "Boosted" label has a rocket icon, the same in every language.
  // It's skipped inside buttons/links/menus so a "Boost post" button never counts.
  const ROCKET = 'svg[data-icon="icon-rocket"]';
  const INTERACTIVE = 'button, a, [role="button"], [role="link"], [role="menuitem"], [role="menu"], nav';
  const MIN_POST_PX = 60;

  // Finds the timeline item (one post) that contains `el`. Works on any layout
  // by climbing until we reach an element that sits in a row of similar,
  // post-sized siblings, which is what a timeline list looks like.
  function findPostItem(el) {
    const oldCell = el.closest(CELL);
    if (oldCell) return oldCell;
    const sig = (n) => `${n.tagName}|${n.getAttribute('role') || ''}|${n.dataset.testid || ''}`;
    for (let node = el; node && node.parentElement && node !== document.body; node = node.parentElement) {
      if (node.classList.contains(BOOSTED)) return node; // already collapsed by us
      if (node.offsetHeight < MIN_POST_PX) continue;
      let similar = 0;
      for (const sib of node.parentElement.children) {
        if (sib !== node && sig(sib) === sig(node) && sib.offsetHeight >= MIN_POST_PX) similar++;
      }
      if (similar >= 2) return node;
    }
    return null;
  }

  // Returns a Map of post element -> label description, for every boosted post on the page.
  function findBoostedPosts() {
    const found = new Map();
    for (const icon of document.querySelectorAll(ROCKET)) {
      if (icon.closest(INTERACTIVE)) continue;
      const post = findPostItem(icon);
      if (post) found.set(post, `rocket icon + "${(icon.parentElement?.parentElement?.innerText || '').trim()}"`);
    }
    // Old X site: plain text label inside the post.
    for (const article of document.querySelectorAll(`${CELL} article`)) {
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.data.trim();
        if (BOOSTED_LABELS.has(text) && t.parentElement && !t.parentElement.closest(NOT_A_LABEL)) {
          found.set(article.closest(CELL), `text "${text}"`);
          break;
        }
      }
    }
    return found;
  }

  function updateBoosted() {
    const boosted = settings.hideBoosted ? findBoostedPosts() : new Map();
    for (const el of document.querySelectorAll(`.${BOOSTED}`)) {
      if (!boosted.has(el)) el.classList.remove(BOOSTED);
    }
    for (const [post, why] of boosted) {
      if (post.classList.contains(BOOSTED)) continue;
      post.classList.add(BOOSTED);
      if (DEBUG) console.log(`[Black Box] hid boosted post (${why}):`, post);
    }
  }

  function debugKept(cell, content) {
    if (!DEBUG || reported.has(cell) || cell.offsetHeight < MIN_GAP_PX) return;
    // Only report cells that look suspicious: tall but with no tweet in them.
    if (cell.querySelector('article [data-testid="tweetText"], article [data-testid="User-Name"]')) return;
    reported.add(cell);
    cell.style.outline = '2px dashed red';
    console.log('[Black Box] kept a tall cell without a tweet. Visible content:', content, 'cell:', cell);
  }

  function check(cell, now) {
    if (cell.classList.contains(BOOSTED)) return; // already hidden as a boosted post

    if (!settings.collapseEmpty) {
      cell.classList.remove(HIDDEN);
      pending.delete(cell);
      return;
    }

    const content = findVisibleContent(cell);

    if (cell.classList.contains(HIDDEN)) {
      // Real content showed up later, so show the cell again.
      if (content) {
        cell.classList.remove(HIDDEN);
        if (DEBUG) console.log('[Black Box] un-hid cell, content appeared:', content, cell);
      }
      return;
    }

    if (content || cell.offsetHeight < MIN_GAP_PX) {
      pending.delete(cell);
      if (content) debugKept(cell, content);
      return;
    }

    // Wait before hiding so tweets that are still loading aren't caught.
    const since = pending.get(cell);
    if (since === undefined) {
      pending.set(cell, now);
      scheduleScan(CONFIRM_MS + 50);
    } else if (now - since >= CONFIRM_MS) {
      pending.delete(cell);
      cell.classList.add(HIDDEN);
      if (DEBUG) console.log('[Black Box] collapsed empty cell:', cell);
    } else {
      scheduleScan(CONFIRM_MS - (now - since) + 50); // make sure we come back
    }
  }

  let timer = null;
  let timerDue = 0;
  function scheduleScan(delay = 150) {
    const due = performance.now() + delay;
    // Keep the earliest pending scan; it reschedules itself while cells are pending.
    if (timer !== null && timerDue <= due) return;
    clearTimeout(timer);
    timerDue = due;
    timer = setTimeout(scan, delay);
  }

  function scan() {
    timer = null;
    const now = performance.now();
    updateBoosted();
    document.querySelectorAll(CELL).forEach((cell) => check(cell, now));
  }

  // Load the user's settings, and re-apply them right away when they change.
  api.storage.sync.get(settings).then((saved) => {
    Object.assign(settings, saved);
    scheduleScan(0);
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
    scheduleScan(0);
  });

  new MutationObserver(() => scheduleScan()).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });
  window.addEventListener('scroll', () => scheduleScan(), { passive: true });

  scan();
})();
