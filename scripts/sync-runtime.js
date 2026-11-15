/* Copy EasyTuber's rig, renderer and action engine into runtime/easytuber/, unmodified.

   The studio previews an action with the very code EasyTuber plays it with, so what you see is what
   you get. Run `npm run sync-runtime` after EasyTuber changes. Usage:
     node scripts/sync-runtime.js [path to the EasyTuber repo]   (default: ../EasyTuber) */
const fs = require('fs');
const path = require('path');

const FILES = ['util.js', 'defs.js', 'placeholder.js', 'assets.js', 'animator.js', 'actions.js', 'renderer.js'];
const ROOT = path.join(__dirname, '..');
const src = path.resolve(process.argv[2] || path.join(ROOT, '..', 'EasyTuber'));
const out = path.join(ROOT, 'runtime', 'easytuber');

function main() {
  const js = path.join(src, 'js');
  if (!fs.existsSync(path.join(js, 'actions.js'))) {
    console.error(`No EasyTuber repo at ${src} (js/actions.js not found).`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) {
    fs.copyFileSync(path.join(js, f), path.join(out, f));
    console.log('copied', f);
  }
  let version = 'unknown';
  try { version = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version; } catch (e) { /* keep unknown */ }
  fs.writeFileSync(path.join(out, 'VERSION'), version + '\n');
  console.log(`EasyTuber ${version} runtime synced to ${path.relative(ROOT, out)}`);
}

main();
