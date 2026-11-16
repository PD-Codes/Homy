#!/usr/bin/env node
/**
 * Package the built add-on (build/extension) for each browser:
 *   ../browser-extension/dist/homy-<version>-{chrome,firefox,opera}.zip  (+ unpacked folders)
 * No dependencies: icons and zip files are written with node:zlib.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const REPO = path.resolve(FRONTEND, '..');
const BUILD = path.join(FRONTEND, 'build', 'extension');
const OUT = path.join(REPO, 'browser-extension', 'dist');

const version = process.env.HOMY_VERSION
  || /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(REPO, 'pyproject.toml'), 'utf8'))?.[1];
if (!version) throw new Error('version not found in pyproject.toml');

const LOCALES = {
  de: { extName: 'Homy', extDescription: 'Modulare Startseite für neue Tabs – lokal oder mit deinem Homy-Server.' },
  en: { extName: 'Homy', extDescription: 'Modular new tab start page – standalone or with your Homy server.' },
};

function manifest(browser) {
  const base = {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'de',
    version,
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: { default_title: 'Homy' },
    permissions: ['storage', 'unlimitedStorage', 'alarms', 'bookmarks', 'topSites'],
    host_permissions: ['http://*/*', 'https://*/*'],
    chrome_url_overrides: { newtab: 'newtab.html' },
  };
  if (browser === 'firefox') {
    return {
      ...base,
      background: { scripts: ['background.js'], type: 'module' },
      browser_specific_settings: {
        gecko: { id: 'homy-companion@domekologe.eu', strict_min_version: '115.0', data_collection_permissions: { required: ['none'] } },
      },
    };
  }
  const chromium = { ...base, background: { service_worker: 'background.js', type: 'module' }, permissions: [...base.permissions, 'favicon'] };
  if (browser === 'opera') {
    // Opera rejects chrome_url_overrides; the background worker redirects Speed Dial instead.
    const { chrome_url_overrides: _drop, ...rest } = chromium;
    return { ...rest, permissions: [...rest.permissions, 'tabs'] };
  }
  return chromium;
}

// ------------------------------------------------------------------ icon (rounded tile + house)
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function icon(size) {
  const px = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22;
  const inTile = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r); const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const inHouse = (x, y) => {
    const u = x / size; const v = y / size;
    const roof = v >= 0.24 && v <= 0.5 && Math.abs(u - 0.5) <= (v - 0.24) * 1.15;
    const body = u >= 0.3 && u <= 0.7 && v >= 0.47 && v <= 0.76;
    const door = u >= 0.45 && u <= 0.55 && v >= 0.6 && v <= 0.76;
    return (roof || body) && !door;
  };
  for (let y = 0; y < size; y += 1) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      if (!inTile(x + 0.5, y + 0.5)) continue;
      const house = inHouse(x + 0.5, y + 0.5);
      px[i] = house ? 0xf4 : 0x2f; px[i + 1] = house ? 0xf6 : 0x6f; px[i + 2] = house ? 0xfa : 0xde; px[i + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ zip
function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'));
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(prefix, e.name);
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [[rel, fs.readFileSync(path.join(dir, e.name))]];
  });
}

if (!fs.existsSync(path.join(BUILD, 'newtab.html'))) throw new Error('run "vite build --config vite.ext.config.ts" first');
fs.mkdirSync(OUT, { recursive: true });
const shared = walk(BUILD);
for (const s of [16, 32, 48, 128]) shared.push([`icons/icon-${s}.png`, icon(s)]);
for (const [lang, msgs] of Object.entries(LOCALES)) {
  shared.push([`_locales/${lang}/messages.json`, Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(msgs).map(([k, v]) => [k, { message: v }])), null, 2))]);
}
for (const browser of ['chrome', 'firefox', 'opera']) {
  const files = [...shared, ['manifest.json', Buffer.from(`${JSON.stringify(manifest(browser), null, 2)}\n`)]];
  const unpacked = path.join(OUT, `unpacked-${browser}`);
  fs.rmSync(unpacked, { recursive: true, force: true });
  for (const [name, data] of files) {
    fs.mkdirSync(path.dirname(path.join(unpacked, name)), { recursive: true });
    fs.writeFileSync(path.join(unpacked, name), data);
  }
  const target = path.join(OUT, `homy-${version}-${browser}.zip`);
  fs.writeFileSync(target, zip(files));
  console.log(`  ${path.relative(REPO, target)}  (${files.length} files)`);
}
