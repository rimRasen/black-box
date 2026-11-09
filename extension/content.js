// Black Box: hides empty boxes left behind in the X timeline
// (usually ads/promoted posts whose content was blocked).

(() => {
  const CELL = '[data-testid="cellInnerDiv"]';
  const HIDDEN = 'bb-empty-cell';
  const MIN_GAP_PX = 40; // ignore thin divider cells
  const CONFIRM_MS = 600; // cell must stay empty this long before we collapse it
  const MEDIA = 'img, video, svg, canvas, iframe, input, textarea, button, a[href], [role="progressbar"]';

  const pending = new WeakMap(); // cell -> time it was first seen empty

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) !== 0;
  }

  // True if the cell renders nothing a person could see.
  function hasNoVisibleContent(cell) {
    if (cell.innerText.trim() !== '') return false;
    for (const el of cell.querySelectorAll(MEDIA)) {
      if (isVisible(el)) return false;
    }
    return true;
  }

  function check(cell, now) {
    const empty = hasNoVisibleContent(cell);

    if (cell.classList.contains(HIDDEN)) {
      // Real content showed up later, so show the cell again.
      if (!empty) cell.classList.remove(HIDDEN);
      return;
    }

    if (!empty || cell.offsetHeight < MIN_GAP_PX) {
      pending.delete(cell);
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
    }
  }

  function scan() {
    timer = null;
    const now = performance.now();
    document.querySelectorAll(CELL).forEach((cell) => check(cell, now));
  }

  let timer = null;
  function scheduleScan(delay = 150) {
    if (timer !== null) return;
    timer = setTimeout(scan, delay);
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
