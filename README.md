# Black Box

<img src="extension/icons/icon-128.png" width="64" align="right" alt="Black Box icon">

A small browser extension that removes the **empty black boxes** in the X (Twitter) timeline.

When an ad blocker hides an ad or promoted post, X often keeps the space it would have used.
That leaves a big blank gap between posts. Black Box finds these empty slots and collapses them.

## Settings

Click the Black Box icon in your browser toolbar:

| Option | Default | What it does |
|---|---|---|
| **Collapse empty boxes** | On | Removes blank gaps in the timeline. |
| **Hide boosted posts** | Off | Hides posts X marks as paid ("Boosted", "Ad", "Promoted"). |

Changes apply right away, with no refresh needed.

Works in **Firefox** (desktop and Android) and **Chromium browsers** (Chrome, Edge, Brave, Opera).

## Install

### Firefox
- **From Mozilla Add-ons:** *(link once published)*
- **Signed `.xpi` from [Releases](../../releases):** open the file in Firefox and click **Add**.
- **Temporary (for testing):** go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → choose `extension/manifest.json`. It is removed when Firefox closes.

### Chrome / Edge / Brave
1. Download and unzip the latest zip from [Releases](../../releases), or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder.

> Chrome may show the warning *"Unrecognized manifest key 'browser_specific_settings'"*.
> That key is only for Firefox, and Chrome ignores it safely.

## How it works

`extension/content.js` watches X's timeline cells (`[data-testid="cellInnerDiv"]`). If a cell is at least
40px tall but shows no visible text, images or video for about 0.6 seconds, it is collapsed to zero
height. X's list then measures it again and moves the posts below up. If content appears in it later, the
cell is shown again.

**Hide boosted posts** looks for X's paid-post label:
- On X's newer site, the "Boosted" label has a rocket icon (`svg[data-icon="icon-rocket"]`). It's matched in
  any language, but ignored inside buttons, links and menus, so a "Boost" button doesn't count. From the label,
  the extension moves up the page to the timeline item it belongs to and collapses it.
- On the older site, it looks for a label that reads exactly "Ad", "Promoted" or "Boosted". It skips the post's
  own text, author name and link previews. Add translations to `BOOSTED_LABELS` in `content.js`.

The only permission is `storage`, used to save your two settings. No network requests, no data collection.
See [PRIVACY.md](PRIVACY.md).

### Debug mode

In the x.com DevTools console, run `localStorage.blackBoxDebug = '1'` and refresh. The console then logs every
box that gets collapsed and every boosted post that gets hidden. Tall boxes that are kept without a post get a
red dashed outline. Turn it off with `localStorage.removeItem('blackBoxDebug')`.

## Development

```sh
npm install
npm run start:firefox   # launch Firefox with the extension loaded, auto-reloads on save
npm run lint            # validate the extension with Mozilla's linter
npm run build           # make dist/black_box_-_x_empty_space_remover-<version>.zip
npm run icons           # regenerate icons (needs Python + Pillow)
```

Project layout:

```
extension/        # what gets shipped: manifest, content script + CSS, settings popup, icons
scripts/          # helper scripts (icon generator)
.github/workflows # CI: lint + build zip, attach it to releases on v* tags
```

## Releasing

1. Update `version` in both `extension/manifest.json` and `package.json`.
2. Commit, then tag and push the release:
   ```sh
   git tag v1.0.1
   git push --tags
   ```
3. GitHub Actions builds the zip and attaches it to the release.

## License

[MIT](LICENSE)
