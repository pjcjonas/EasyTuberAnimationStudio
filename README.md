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

## Walkthrough: your first action

This walks through making a short wave from start to finish. The pictures are from the real app (`npm run screenshots` takes them again).

### 1. The screen

<img src="docs/images/01-screen.jpg" alt="The studio window" width="800">

- **Stage** (middle): the avatar you are animating, drawn by EasyTuber's own renderer.
- **Posing tools** (top left of the stage): **Free** / **Joint** motion, then **Rotate**, **Move** and **Scale**.

  <img src="docs/images/02-posing-tools.jpg" alt="The posing tools" width="800">

- **The action** (top bar): the **Id** becomes the file name, the **Name** is what EasyTuber's Actions tab shows, the **Length** is in frames and **fps** is the frame rate (24 by default, as in Animate).

  <img src="docs/images/03-action-fields.jpg" alt="The action's Id, Name and Length" width="800">

- **Timeline** (bottom): laid out like Flash / Adobe Animate. One layer per body part (front to back), groups as folders, a grid of frames with the red playhead. The dots are keyframes.

  <img src="docs/images/04-timeline.jpg" alt="The timeline" width="800">

- **Inspector** (right): the exact numbers of whatever is selected, and the settings of the whole action. The **Code** tab next to it shows the file the studio will export.

  <img src="docs/images/05-inspector.jpg" alt="The inspector" width="800">

### 2. Pivots

Click a part to select it. The pink crosshair is its **pivot**: the point it turns and sizes around. In Free mode it starts in the middle of the part.

<img src="docs/images/06-pivot.jpg" alt="A selected part and its pivot" width="800">

Drag the crosshair to put the pivot anywhere. Hold **Ctrl** to snap it to the part's joint, middle, edges or corners. With the pivot on the shoulder, the upper arm turns like a real arm.

<img src="docs/images/07-pivot-on-joint.jpg" alt="The pivot snapped to the shoulder" width="800">

### 3. Move, turn, size and fade

**Move** (`M`, or hold Shift) puts a part anywhere on the 1920×1080 stage; the label shows where its pivot is, in stage pixels. **Rotate** (`R`) turns it around its pivot (Ctrl snaps to 15°). **Scale** (`S`, or hold Alt) grows it when you drag up and shrinks it when you drag down. **Opacity** in the Inspector fades it out; 0 hides it.

<img src="docs/images/08-move-tool.jpg" alt="The face moved across the stage" width="800">

Every part moves on its own. Ctrl+Z undoes anything.

### 4. Make a wave

1. Press **New**, then set the **Id** (`hello-wave`) and the **Name** (`Hello wave`). Leave the length at 49 frames (2 seconds at 24 fps).

   <img src="docs/images/09-new-action.jpg" alt="A new action called hello-wave" width="800">

2. Put the upper arm's pivot on the shoulder and the forearm's on the elbow (select the part, Ctrl+drag the crosshair onto the joint).
3. The forearm should hang from the upper arm: select the upper arm and tick **children go with it** in the Inspector.

   <img src="docs/images/10-children-follow.jpg" alt="children go with it, ticked for the upper arm" width="800">

4. Keys are always set at the **playhead** (the red line). Drag it to frame 13 (half a second) on the ruler, then turn the upper arm up. The forearm comes with it.

   <img src="docs/images/11-arm-up.jpg" alt="The arm raised at 500 ms" width="800">

5. The studio also added **rest keys** at the start and the end, so the arm rises from its normal position and comes back down by itself.

   <img src="docs/images/12-rest-keys.jpg" alt="Keys for the upper arm, with rest keys at both ends" width="800">

6. Bend the forearm at the elbow so the hand points up. Then wave: at frame 20 tilt the forearm out, at frame 27 back in, at frame 34 out again.

   <img src="docs/images/13-wave-keys.jpg" alt="The forearm's wave keys" width="800">

7. To keep the upper arm up while it waves, go to frame 37, select it and type `-100` into **Turn** in the Inspector. A typed number sets a key at the playhead, just like a drag. Press **Space** to play.

### 5. Refine in the timeline

Click a frame to select it (the playhead jumps there); drag across frames and layers to select a block. Drag a keyframe left or right to retime it, or drag a selected block to move it all (Alt+drag copies). Click **≡** next to a layer to open its X, Y, Turn, Size and Opacity rows (its motion rows).

<img src="docs/images/14-part-rows.jpg" alt="The upper arm's rows opened" width="800">

Right-click the frames for **Create Classic Tween** / **Remove Tween** and the **easing**, how the motion travels to the next keyframe (blue frames with an arrow tween; grey frames hold still). *outBack* overshoots a little, which feels bouncy. The same menu has Flash's frame commands: Insert Frame (F5), Remove Frames (Shift+F5), Insert Keyframe (F6), Insert Blank Keyframe (F7), Clear Keyframe (Shift+F6), copy / paste frames and Reverse Frames.

<img src="docs/images/15-easing-menu.jpg" alt="The easing menu" width="800">

A block of frames selects every key inside it, face keys too: drag it to move them all, or change their easing or value in the Inspector at once. Double-click a frame to select its whole span; **Delete** removes the selected keys; **Esc** clears the selection. (These pictures show the timeline before it looked like Flash; the steps are the same.)

<img src="docs/images/16-box-select-keys.jpg" alt="Three keys selected with a box" width="800">

### 6. Several parts at once

Ctrl+click parts, or drag a box over empty stage, to select several. A drag then moves, turns or sizes them as one group around the pivot of the part you grab. **K** keys every selected part; **Ctrl+A** selects every part. To keep them together, press **Ctrl+G**: they become a group with motion of its own (see [Groups](#groups)).

<img src="docs/images/17-group-rotate.jpg" alt="The whole head tilted as one group" width="800">

### 7. Eyes, mouth and expressions

**Face at the playhead** in the Inspector sets the eyes, mouth and expression from the playhead on. Here the eyes close at 600 ms for a happy squint and go back to **normal** at 1400 ms. *Normal* hands blinking and talking back to EasyTuber. Your own expressions show up in the list when you preview on your avatar.

<img src="docs/images/18-face.jpg" alt="Eyes closed at 600 ms" width="800">

### 8. Effects, sounds and layers

Pick an effect in **Add** (sparkles, music notes, motion marks, emoji burst, caption, your own picture) and press **+ Effect**. It shows as a bar in the effects rows: drag it to move it, drag its ends to change when it starts and stops. Each effect sits on a point of a part: press **⌖ Pick** and click the avatar.

<img src="docs/images/19-effect.jpg" alt="Motion marks on the waving hand" width="800">

Every effect gets its own switch in EasyTuber, so it can be turned off later without editing the action. **+ Sound…** adds a sound at the playhead (copied next to the action on export). **+ Parts in front** draws chosen parts over the rest for a while, for an arm reaching across the face.

### 9. Action settings and held actions

The **Action** card holds blend in / out (the fades only show while playing; paused, the stage shows the pose at full strength), the **Strength** slider EasyTuber shows, rest keys and the media folder.

Tick **Held** for an action that stays on until it is turned off, like a "be right back" pose. The green bar on the ruler is the loop: after playing through once, the action repeats that part. **Turn on** / **Turn off** preview it the way EasyTuber plays it.

<img src="docs/images/20-held-loop.jpg" alt="A held action's loop on the ruler" width="800">

Pick **My EasyTuber avatar** (top right) to preview on your own avatar, including parts you added.

### 10. Export to EasyTuber

The **Code** tab shows the file the studio wrote; any problems are listed at the top.

<img src="docs/images/21-code.jpg" alt="The Code tab" width="800">

**Export > Save action as…** (Ctrl+E) writes `hello-wave.js`. In EasyTuber, open the **Actions** tab, click **Open actions folder**, put the file there (and its media folder, if it has one), and press **Reload actions**. The action is then ready for a hotkey or Streamer.bot. Save the project too (Ctrl+S); an exported `.js` can also be opened again for editing.

<img src="docs/images/22-export.jpg" alt="The Export menu" width="800">

The **?** button lists every shortcut.

<img src="docs/images/23-shortcuts.jpg" alt="The shortcuts and about box" width="800">

## Free motion: every part, anywhere

In **Free** mode (the default, `F`) every part is its own layer on the 1920×1080 stage. Move it anywhere, turn it, size it, fade it. Nothing is attached to anything: moving the torso leaves the head and arms where they are. If you do want the parts hanging from a part to come along, tick **children go with it** for that part.

Each part turns and sizes around its **pivot**, the pink crosshair. It starts in the middle of the part. Drag it anywhere, even outside the part; hold Ctrl to snap it to the part's joint, middle, edges or corners. A pivot on the joint is stored as "the joint", so it fits any avatar the action plays on. Turn or scale several selected parts and they move as one group around the pivot of the part you grabbed.

**Joint** mode (`J`) is EasyTuber's own rig motion instead: parts turn around the joints set up in EasyTuber's Part tab, and children always follow.

## The timeline, like Flash / Animate

- **Frames**: the timeline is a grid of frames at the action's frame rate (**fps**, top bar). Frame numbers run along the ruler (1, 5, 10…); the red playhead shows the frame it is on. The action's length is in frames too. A new frame rate keeps every key on its frame, as in Flash, so the action plays faster or slower (**Action > Frame rate: keep the timing** keeps the times instead). EasyTuber still plays the motion smoothly between frames.
- **Layers**: one per part, the front-most at the top. **Groups** are folders with their parts inside (▸ opens and closes them). The face, sounds and effects have their own folders.
- **Keyframes**: a filled dot is a keyframe, a hollow dot a blank keyframe (nothing shows from there: the layer's opacity is 0, or a face track goes back to normal). Grey frames hold still; blue frames with an arrow tween to the next keyframe; the hollow box marks a still span's last frame.
- **The eye and the lock**: the eye hides a layer in the studio (it is still exported); the lock keeps it from being picked on the stage, so a click goes through to what is behind. Alt+click shows (or unlocks) only that layer; the icons above the layers do every layer.
- **Selecting**: click a frame, drag a block across frames and layers, Shift+click to extend, double-click for a span, Ctrl+Alt+A for every frame. Clicking a layer's frames also selects that part on the stage.
- **Commands** (right-click, or the keys): `F5` insert frames (as many as are selected) and `Shift+F5` remove them; `F6` insert a keyframe holding what shows there now (on every selected frame) and `Shift+F6` clear keyframes; `F7` insert a blank keyframe; **Create Classic Tween** / **Remove Tween** and the eases; `Ctrl+Alt+C` / `X` / `V` copy / cut / paste frames; `Alt+Backspace` clear frames; **Reverse Frames**. F5 or F6 on frames past the end makes the action longer to reach them. Removing frames from every layer makes it shorter.
- **Auto keyframe** (bottom bar, on by default): a change on the stage or in the Inspector sets a key at the playhead, as in Animate. Turn it off for Flash's classic way: a change on a frame between keyframes changes the keyframe that frame belongs to.
- **Onion skin** (bottom bar): the frames before (blue) and after (green) the playhead show faintly on the stage while paused. Pick how many, or drag the markers on the ruler.
- **Playing**: `Enter` (or `Space`) plays and stops, `Ctrl+Enter` plays from the first frame, `,` `.` and `←` `→` step a frame, `Shift+,` `Shift+.` jump between keyframes.

## Groups

Select some parts (or groups) and press **Ctrl+G** (or **Group** under the layers). A group works like a group in Flash, with motion of its own:

- click any part of it on the stage and the whole group is picked (a cyan box). Drag to move, turn or size the group with the usual tools; keys go on the group's own layer. Its pivot (the crosshair) starts in the middle of its parts: drag it anywhere, Ctrl puts it back.
- **double-click** the group to edit inside it: clicks then pick its parts (or the groups inside it), and the bar at the top of the stage says where you are. **Esc**, a double-click on empty stage or a click on that bar backs out.
- each part's own motion goes on inside the group's, so a group can turn while an arm in it waves. Groups can go inside groups. Fading a group fades everything in it.
- the Inspector's group card has its name (or double-click its name in the timeline), what is in it, its motion, and its pivot. **Ctrl+Shift+G** ungroups: the parts keep their keys, the group's own keys go.
- groups are part of the exported action, so they play in EasyTuber exactly as in the studio.

## Making an action

1. Set the **Id** (the file name, letters/digits/`-`/`_`), the **Name**, the **Length** (frames) and the frame rate at the top. Tick **Held** for an action that stays on until it is turned off.
2. Move the playhead (click a frame, or drag the ruler) and pose parts on the stage with the tool picked at the top left of the stage:
   - **Move** (`M`, or hold Shift): put a part anywhere on the stage. The label shows where its pivot is, in stage pixels.
   - **Rotate** (`R`): turn a part around its pivot (Ctrl snaps to 15°).
   - **Scale** (`S`, or hold Alt): drag up to grow, down to shrink.
   - **Opacity** is in the Inspector: 0 hides the part.
   - paused, the stage shows the pose at the playhead at full strength. The blend in/out fades only show while playing, exactly as in EasyTuber.
   - every drag sets a key at the playhead. The first key on a track also adds rest keys at the start and end, so the part moves out of rest and back (turn this off under **Action > Rest keys**).
   - **several parts at once:** Ctrl+click parts (on the stage or their names in the timeline), drag a box on empty stage, or press Ctrl+A. A drag then moves them all by the same amount, or turns or scales them as one group around the pivot of the part you grabbed. A value typed in the Inspector goes on all of them, **K** keys them all, and pasting one part's keys puts them on every selected part.
3. Refine in the **timeline** (see [above](#the-timeline-like-flash--animate)): select frames, drag keyframes to retime them, right-click for tweens and easing, F5 / F6 / F7 for frames and keyframes, **Delete** to remove. Click **≡** on a layer to see its motion rows. Drag the timeline's top edge to make it taller (double-click for the default height); **Ctrl+wheel** (or `-` `=`, or the **− + ↔** buttons) zooms in on time around the mouse, and **Shift+wheel** or the wheel over the ruler scrolls through it.
4. **Face**: eyes, mouth and expression keys (expressions come from your avatar). A key set to **normal** hands the face back to EasyTuber's blinking and talking.
5. **Add** effects (sparkles, music notes, motion marks, emoji burst, caption, your own picture), sounds, and **parts in front** (an arm reaching across the face). Effects sit on a point of a part: pick it on the stage with **⌖ Pick**.
6. **Action** settings: blend in/out, the **Strength** slider EasyTuber shows, the held loop and release, and the media folder.

Pick **My EasyTuber avatar** (top right) to preview on your own avatar, including your own parts. It is read from `%APPDATA%\EASY-TUBER` (macOS: `~/Library/Application Support/EASY-TUBER`), read only.

Keys (also under **?** in the app): `F` `J` free / joint motion · `R` `M` `S` rotate/move/scale tool · `Enter` / `Space` play/stop · `Ctrl+Enter` play from the start · `,` `.` `←` `→` previous/next frame · `Shift+,` `Shift+.` previous/next keyframe · `F5` / `Shift+F5` insert / remove frames · `F6` / `Shift+F6` insert / clear keyframe · `F7` blank keyframe · `Ctrl+Alt+C` `X` `V` `A` copy / cut / paste / select all frames · `Ctrl+G` / `Ctrl+Shift+G` group / ungroup · double-click a group: edit inside (`Esc` backs out) · `Ctrl+click` / box: select several parts · `Ctrl+A` every layer · `K` key the selected layers · `Ctrl+wheel` / `-` `=` zoom the timeline · `Del` delete · `Ctrl+C`/`Ctrl+V` copy/paste keys · `Ctrl+Z`/`Ctrl+Y` · `Ctrl+S` save · `Ctrl+E` export.

## Tutorial video

`npm run tutorial` records a narrated walkthrough of the real app (Windows): it speaks each line with a Windows voice, drives the studio with a visible cursor and captions, and writes `tutorial/EasyTuberStudio-tutorial.mp4` and an `.srt`. It uses the US English voice Mark, or else David (install **English (United States)** under **Settings > Time & language > Speech**); pick another with `--voice`, or record some chapters with `--chapters 3-5`. Needs ffmpeg. The narration and the on-screen steps are in `scripts/tutorial/script.js`.

`npm run screenshots` runs the same steps without narration and saves the walkthrough pictures above into `docs/images/` (the chapter on your own avatar is skipped, so it never ends up in them).

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
