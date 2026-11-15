# Changelog

Each release's section here becomes its GitHub release notes.

## 0.1.0

The first release.

- Keyframe EasyTuber actions on the real rig with the Rotate, Move and Scale tools (R, M, S; Shift moves and Alt scales with any tool). Every drag sets a key at the playhead.
- The selected part's pivot, the point it turns around, shows as a pink crosshair; pointing at a part shows its name. Paused, the stage shows the pose at full strength; the blend fades show while playing.
- Pose several parts at once: Ctrl+click parts, or drag a box on the stage. A drag, a typed value, **K** or a paste applies to every selected part; a part whose parent is selected follows it instead of turning twice.
- Timeline with a row per part (open it up for Rotate / Move / Scale), easing per key, box-select keys with Shift+drag, move several keys together, copy and paste.
- Eyes, mouth and expression tracks, parts drawn in front, sounds, and effects: sparkles, music notes, motion marks, emoji burst, captions with Streamer.bot values, and your own pictures.
- Held actions with a loop and a release, tested with Turn on / Turn off.
- A Strength slider and switches for effects, which show up in EasyTuber's Actions tab.
- Preview on the placeholder rig or on your own EasyTuber avatar, custom parts included. The preview runs EASY-TUBER's own renderer and action engine.
- A narrated tutorial video can be recorded from the real app (`npm run tutorial`).
- Export the action file (and its media) with **Save action as…** or **Copy code**. Exported files can be opened again for editing.
