/* Reading EasyTuber's saved avatar (read only) and serving its pictures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const avatar = require('../electron/avatar');

test('the avatar file is where EasyTuber keeps it', () => {
  assert.equal(avatar.defaultFile(path.join('A', 'B')), path.join('A', 'B', 'EASY-TUBER', 'avatar.easytuber.json'));
});

test('read gives the text and the images folder, or a readable error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etstudio-'));
  const file = path.join(dir, 'avatar.easytuber.json');
  assert.throws(() => avatar.read(file), /No saved EasyTuber avatar/);
  fs.writeFileSync(file, '{ not json');
  assert.throws(() => avatar.read(file), /not a valid avatar/);
  fs.writeFileSync(file, '{"parts":{}}');
  const r = avatar.read(file);
  assert.equal(r.text, '{"parts":{}}');
  assert.equal(r.imagesDir, path.join(dir, 'images'));
});

test('only picture hashes map to files', () => {
  const h = 'a'.repeat(64);
  assert.equal(avatar.imageFile('/imgs', h), path.join('/imgs', h));
  assert.equal(avatar.imageFile('/imgs', '../../etc/passwd'), null);
  assert.equal(avatar.imageFile(null, h), null);
});

test('picture types come from the bytes', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(avatar.typeOf(png), 'image/png');
  assert.equal(avatar.typeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(avatar.typeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
  assert.equal(avatar.typeOf(Buffer.from('hello there, world')), 'application/octet-stream');
});
