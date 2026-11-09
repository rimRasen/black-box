// Black Box: hides empty boxes left behind in the X timeline
// (usually ads/promoted posts whose content was blocked).
//
// Debug mode: in the x.com DevTools console run
//   localStorage.blackBoxDebug = '1'   then reload
// Tall cells that are kept get a red outline and a console log saying which
// element counted as "visible content". Turn it off with
//   localStorage.removeItem('blackBoxDebug')

(() => {
  const CELL = '[data-testid="cellInnerDiv"]';
  const HIDDEN = 'bb-empty-cell';
  const MIN_GAP_PX = 40; // ignore thin divider cells
  const CONFIRM_MS = 600; // cell must stay empty this long before we collapse it
  // Elements that draw pixels without text. Links/buttons are left out because
  // they're often empty, transparent wrappers; their visible text/icons are
  // checked separately.
  const MEDIA = 'img, video, canvas, iframe, svg, [role="progressbar"], [style*="background-image"]';

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

  function debugKept(cell, content) {
    if (!DEBUG || reported.has(cell) || cell.offsetHeight < MIN_GAP_PX) return;
    // Only report cells that look suspicious: tall but with no tweet in them.
    if (cell.querySelector('article [data-testid="tweetText"], article [data-testid="User-Name"]')) return;
    reported.add(cell);
    cell.style.outline = '2px dashed red';
    console.log('[Black Box] kept a tall cell without a tweet. Visible content:', content, 'cell:', cell);
  }

  function check(cell, now) {
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
    document.querySelectorAll(CELL).forEach((cell) => check(cell, now));
  }

  new MutationObserver(() => scheduleScan()).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });
  window.addEventListener('scroll', () => scheduleScan(), { passive: true });

  scan();
})();
