const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { collapseEmpty: true, hideBoosted: false };

api.storage.sync.get(DEFAULTS).then((settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const box = document.getElementById(key);
    if (!box) continue;
    box.checked = value;
    box.addEventListener('change', () => api.storage.sync.set({ [key]: box.checked }));
  }
});
