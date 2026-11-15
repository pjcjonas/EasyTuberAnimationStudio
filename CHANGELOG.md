# Changelog

Each release's section here becomes its GitHub release notes.

## 0.1.0

The first release.

- Free motion: every part is its own layer on the 1920×1080 stage. Move it anywhere, turn and size it around a pivot you drag wherever you like (Ctrl snaps to the joint, middle, edges, corners), and fade it. Parts move on their own; "children go with it" links a part's children when you want.
- Joint motion (EasyTuber's rig) is still there, one switch away (F / J).
- Rotate, Move and Scale tools (R, M, S; Shift moves and Alt scales with any tool). Every drag sets a key at the playhead. Paused, the stage shows the pose at full strength; the blend fades show while playing.
- Pose several parts at once: Ctrl+click parts, or drag a box on the stage. A drag, a typed value, **K** or a paste applies to every selected part; turning or scaling a group swings it round the grabbed part's pivot.
- Timeline with a row per part (open it up for Rotate / Move / Scale), easing per key, box-select keys with Shift+drag, move several keys together, copy and paste.
- Eyes, mouth and expression tracks, parts drawn in front, sounds, and effects: sparkles, music notes, motion marks, emoji burst, captions with Streamer.bot values, and your own pictures.
- Held actions with a loop and a release, tested with Turn on / Turn off.
- A Strength slider and switches for effects, which show up in EasyTuber's Actions tab.
- Preview on the placeholder rig or on your own EasyTuber avatar, custom parts included. The preview runs EASY-TUBER's own renderer and action engine.
- A narrated tutorial video can be recorded from the real app (`npm run tutorial`).
- Export the action file (and its media) with **Save action as…** or **Copy code**. Exported files can be opened again for editing.
