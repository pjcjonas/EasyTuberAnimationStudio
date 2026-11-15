# EasyTuber Animation Studio

[![Test](https://github.com/pjcjonas/EasyTuberAnimationStudio/actions/workflows/test.yml/badge.svg)](https://github.com/pjcjonas/EasyTuberAnimationStudio/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/pjcjonas/EasyTuberAnimationStudio)](https://github.com/pjcjonas/EasyTuberAnimationStudio/releases/latest)

Make [EASY-TUBER](https://github.com/pjcjonas/EasyTuber) actions by keyframing them on the real rig, then export the action file.

The preview *is* EasyTuber: the studio runs EasyTuber's own renderer, idle animator and action engine (copied unmodified into `runtime/easytuber/`) and plays the exact file it is about to export. What you see is what EasyTuber, the stage window and OBS will show.

## Download

Get the zip for your computer from the [latest release](https://github.com/pjcjonas/EasyTuberAnimationStudio/releases/latest): Windows x64, or macOS (Apple silicon / Intel). The release notes say how to open it the first time (the apps aren't code-signed yet).

## Run it from source

```
npm install
npm start
npm test        # the exported code, run in EasyTuber's action engine
```

## Making an action

1. Set the **Id** (the file name, letters/digits/`-`/`_`), the **Name** and the **Length** at the top. Tick **Held** for an action that stays on until it is turned off.
2. Move the playhead (click or drag the ruler) and pose parts on the stage:
   - **drag** a part to rotate it around its joint (Ctrl snaps to 15°)
   - **Shift+drag** to move it, **Alt+drag** to scale it
   - every drag sets a key at the playhead. The first key on a track also adds rest keys at the start and end, so the part moves out of rest and back (turn this off under **Action > Rest keys**).
   - **several parts at once:** Ctrl+click parts (on the stage or their names in the timeline), drag a box on empty stage, or press Ctrl+A. A drag then turns, moves or scales them all by the same amount, each around its own joint. A value typed in the Inspector goes on all of them, **K** keys them all, and pasting one part's keys puts them on every selected part.
3. Refine in the **timeline**: drag keys to retime them, right-click for easing, double-click a row to add a key, **Delete** to remove. Click **▸** on a part to see its Rotate / Move / Scale rows. Shift+click keys, or Shift+drag a box over empty timeline, to select many keys: drag them together, set their easing or value at once, or move them by a number of ms.
4. **Face**: eyes, mouth and expression keys (expressions come from your avatar). A key set to **normal** hands the face back to EasyTuber's blinking and talking.
5. **Add** effects (sparkles, music notes, motion marks, emoji burst, caption, your own picture), sounds, and **parts in front** (an arm reaching across the face). Effects sit on a point of a part: pick it on the stage with **⌖ Pick**.
6. **Action** settings: blend in/out, the **Strength** slider EasyTuber shows, the held loop and release, and the media folder.

Pick **My EasyTuber avatar** (top right) to preview on your own avatar, including your own parts. It is read from `%APPDATA%\EASY-TUBER` (macOS: `~/Library/Application Support/EASY-TUBER`), read only.

Keys (also under **?** in the app): `Space` play/pause · `,` `.` previous/next key · `←` `→` nudge the playhead (Shift ×10) · `Ctrl+click` / box: select several parts · `Ctrl+A` every part · `K` key the selected parts · `Shift+drag` (timeline) box-select keys · `Del` delete · `Ctrl+C`/`Ctrl+V` copy/paste keys · `Ctrl+Z`/`Ctrl+Y` · `Ctrl+S` save · `Ctrl+E` export.

## Getting it into EasyTuber

**Export > Save action as…** writes `<id>.js`. If the action has sounds or pictures, it also copies them into an `<id>/` folder beside it. Move both into EasyTuber's actions folder (**Actions tab > Open actions folder**) and press **Reload actions**. **Copy code** puts the file's text on the clipboard instead.

The exported file is plain, readable JavaScript: keyframes as data plus a small sampler, following `js/actions/README.md` in the EasyTuber repo. It also carries the studio project as a comment at the end, so **Open…** can load an exported `.js` back for editing. That comment holds no file paths from your computer. Projects can also be saved as `.etaction.json`.

## When EasyTuber changes

```
npm run sync-runtime            # copies ../EasyTuber/js/{util,defs,placeholder,assets,animator,actions,renderer}.js
npm run sync-runtime -- <path>  # from another checkout
```

## Layout

| | |
|---|---|
| `build/` | app icons (`npm run icon` redraws them) |
| `electron/` | window, `app://` pages (studio files, avatar pictures, the action's media), file dialogs |
| `runtime/easytuber/` | EasyTuber's runtime, unmodified (`VERSION` says which) |
| `src/interp.js` | easing and sampling. The same text is pasted into every exported file. |
| `src/model.js` | the project format and keyframe editing |
| `src/codegen.js` | project → action file, and back |
| `src/effects.js` | effect presets |
| `src/preview.js` | the frame loop around EasyTuber's renderer and action engine |
| `src/stage-tools.js`, `src/timeline.js`, `src/inspector.js`, `src/app.js` | the editor |

## Releases

Push a tag like `v0.2.0` and GitHub Actions builds the Windows and macOS apps and publishes them as a release. See [RELEASING.md](RELEASING.md); changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Licence

EasyTuber Animation Studio is free software under the [GNU GPL version 3](LICENSE) with the additional terms in [NOTICE](NOTICE). It includes files from EASY-TUBER (in `runtime/easytuber/`), under EASY-TUBER's own licence.

The action files you export are yours: the code the studio writes into them may be used under any terms.

Based on EASY-TUBER, created by pjcjonas — https://github.com/pjcjonas/EasyTuber
