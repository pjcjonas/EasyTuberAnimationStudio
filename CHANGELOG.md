# Changelog

Each release's section here becomes its GitHub release notes.

## 1.1.0

- The timeline now works like Flash / Adobe Animate: a frame grid at the action's frame rate (24 fps by default), frame numbers on the ruler, the red playhead, one layer per part (front-most at the top), keyframes and blank keyframes, grey still spans and blue tweens with an arrow. Lengths and times are in frames; the exported file still runs in ms.
- Flash's frame commands: F5 / Shift+F5 insert / remove frames, F6 / Shift+F6 insert / clear keyframes, F7 blank keyframe, Create Classic Tween / Remove Tween and eases, copy / cut / paste / clear / select all frames (Ctrl+Alt+C / X / V, Alt+Backspace, Ctrl+Alt+A) and Reverse Frames. Select frames by clicking or dragging a block; drag keyframes or a selection (Alt+drag copies).
- Groups (Ctrl+G / Ctrl+Shift+G): parts moved, turned, sized and faded together around a pivot of their own, with their own layer, as folders in the timeline. Click a part to pick its group; double-click to edit inside it. Groups can be nested, and they are exported.
- The eye and the lock on every layer (hide it in the studio; keep it from being picked on the stage), onion skin, Auto keyframe (off: Flash's classic way, a change edits the keyframe its frame belongs to), frame sizes, Enter to play and , . to step frames.
- The timeline can be made taller or shorter (drag its top edge) and zoomed (Ctrl+wheel, - =).

## 1.0.0

The first release.

- Free motion: every part is its own layer on the 1920×1080 stage. Move it anywhere, turn and size it around a pivot you drag wherever you like (Ctrl snaps to the joint, middle, edges, corners), and fade it. Parts move on their own; "children go with it" links a part's children when you want.
- Joint motion (EasyTuber's rig) is still there, one switch away (F / J).
- Rotate, Move and Scale tools (R, M, S; Shift moves and Alt scales with any tool). Every drag sets a key at the playhead. Paused, the stage shows the pose at full strength; the blend fades show while playing.
- Pose several parts at once: Ctrl+click parts, or drag a box on the stage. A drag, a typed value, **K** or a paste applies to every selected part; turning or scaling a group swings it round the grabbed part's pivot.
- Timeline with a row per part (open it up for Rotate / Move / Scale), easing per key, drag a box over the timeline to select keys across parts and face rows, drag them all together, set their easing or value at once, copy and paste.
- Eyes, mouth and expression tracks, parts drawn in front, sounds, and effects: sparkles, music notes, motion marks, emoji burst, captions with Streamer.bot values, and your own pictures.
- Held actions with a loop and a release, tested with Turn on / Turn off.
- A Strength slider and switches for effects, which show up in EasyTuber's Actions tab.
- Preview on the placeholder rig or on your own EasyTuber avatar, custom parts included. The preview runs EASY-TUBER's own renderer and action engine.
- A narrated tutorial video can be recorded from the real app (`npm run tutorial`).
- Export the action file (and its media) with **Save action as…** or **Copy code**. Exported files can be opened again for editing.
