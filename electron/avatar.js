/* Finding EasyTuber's saved avatar, read only.

   EasyTuber keeps it in its app-data folder (Electron's userData for the app "EASY-TUBER"):
     Windows  %APPDATA%\EASY-TUBER\avatar.easytuber.json
     macOS    ~/Library/Application Support/EASY-TUBER/avatar.easytuber.json
     Linux    ~/.config/EASY-TUBER/avatar.easytuber.json
   Its pictures are files in images/ beside it, named by the SHA-256 of their bytes; the avatar says
   "img:<hash>" where each picture goes. Older avatars hold the pictures as data URLs instead. */
const fs = require('fs');
const path = require('path');

const FILE = 'avatar.easytuber.json';
const HASH = /^[0-9a-f]{64}$/;

function defaultFile(appData) { return path.join(appData, 'EASY-TUBER', FILE); }

// { text, file, imagesDir } for the avatar file, or throws a readable error
function read(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    throw new Error(e.code === 'ENOENT' ? `No saved EasyTuber avatar at ${file}. Open EasyTuber and make one first.` : `Could not read ${file}: ${e.message}`);
  }
  try { JSON.parse(text); } catch (e) { throw new Error(`${path.basename(file)} is not a valid avatar file.`); }
  return { text, file, imagesDir: path.join(path.dirname(file), 'images') };
}

// the file for one picture, or null for a name that isn't a picture hash
function imageFile(imagesDir, hash) {
  if (!imagesDir || !HASH.test(hash)) return null;
  return path.join(imagesDir, hash);
}

/* What kind of picture these bytes are, from how they start (the files have no extension). */
function typeOf(buf) {
  if (!buf || buf.length < 12) return 'application/octet-stream';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return 'image/gif';
  if (buf.toString('latin1', 0, 2) === 'BM') return 'image/bmp';
  if (buf.toString('latin1', 4, 12) === 'ftypavif') return 'image/avif';
  if (/<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 4096)))) return 'image/svg+xml';
  return 'application/octet-stream';
}

module.exports = { FILE, defaultFile, read, imageFile, typeOf };
