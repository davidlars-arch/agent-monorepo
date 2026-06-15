# FF6-Inspired RPG

Original Unity RPG prototype slot for WebGL publishing.

This project is intentionally only inspired by classic 16-bit JRPG structure. Do not add copyrighted assets, names, music, sprites, maps, dialogue, or other protected Final Fantasy VI material.

## Folders

- `unity-project` - Unity project source belongs here.
- `webgl-build` - Unity WebGL build output belongs here.

## Web UI Mount

The Next.js route at `/unity-rpg` currently renders a placeholder runtime screen. Once a Unity WebGL build exists, wire that route to the generated Unity loader in `webgl-build`.

## First Slice

See `design/vertical-slice.md` for the current target. The web route already includes a clickable mock of that slice so gameplay flow can be tested before Unity is installed.

The current mock has a more complete battle beat than the initial scaffold: enemy intent, MP, Defend, Focus, Spark, victory, and defeat states. Keep it mechanically aligned with `unity-project/Assets/Scripts/Battle/BattleController.cs` until the real WebGL build replaces the mock.
