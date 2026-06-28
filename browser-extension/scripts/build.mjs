#!/usr/bin/env node
/**
 * Build Homy browser extension packages:
 *   homy-<version>-chrome.zip
 *   homy-<version>-firefox.zip
 *   homy-<version>-opera.zip
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');

function readVersion() {
    const toml = fs.readFileSync(path.join(REPO, 'pyproject.toml'), 'utf8');
    const m = toml.match(/^version\s*=\s*"([^"]+)"/m);
    if (!m) throw new Error('version not found in pyproject.toml');
    return m[1];
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

function writeManifest(staging, browser, version) {
    const src = path.join(ROOT, browser, 'manifest.json');
    const raw = fs.readFileSync(src, 'utf8');
    const manifest = JSON.parse(raw);
    manifest.version = version;
    fs.writeFileSync(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
        c ^= buf[i];
        for (let k = 0; k < 8; k += 1) {
            c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
        }
    }
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const chunk = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(chunk), 0);
    return Buffer.concat([len, chunk, crc]);
}

/** Solid indigo tile (#6366f1) — no extra dependencies. */
function createSolidPng(size) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
        const i = 1 + x * 3;
        row[i] = 0x63;
        row[i + 1] = 0x66;
        row[i + 2] = 0xf1;
    }
    const raw = Buffer.alloc((1 + size * 3) * size);
    for (let y = 0; y < size; y += 1) row.copy(raw, y * row.length);
    const compressed = zlib.deflateSync(raw);
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
        signature,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function ensureIcons(iconsDir) {
    fs.mkdirSync(iconsDir, { recursive: true });
    for (const size of [16, 32, 48, 128]) {
        const file = path.join(iconsDir, `icon-${size}.png`);
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, createSolidPng(size));
        }
    }
}

function zipDir(sourceDir, outZip) {
    fs.mkdirSync(path.dirname(outZip), { recursive: true });
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
    if (process.platform === 'win32') {
        const escaped = outZip.replace(/'/g, "''");
        execSync(
            `powershell -NoProfile -Command "Get-ChildItem -Path '${sourceDir.replace(/'/g, "''")}' | Compress-Archive -DestinationPath '${escaped}' -Force"`,
            { stdio: 'inherit' },
        );
    } else {
        execSync(`zip -r -q "${outZip}" .`, { cwd: sourceDir, stdio: 'inherit' });
    }
}

function buildBrowser(browser, version, outDir) {
    const staging = path.join(outDir, `_staging-${browser}`);
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    copyDir(path.join(ROOT, 'shared'), staging);
    const iconsDir = path.join(staging, 'icons');
    const customIcons = path.join(ROOT, 'icons');
    if (fs.existsSync(customIcons)) copyDir(customIcons, iconsDir);
    ensureIcons(iconsDir);
    const localesDir = path.join(ROOT, '_locales');
    if (fs.existsSync(localesDir)) copyDir(localesDir, path.join(staging, '_locales'));
    writeManifest(staging, browser, version);
    let zipPath = path.join(outDir, `homy-${version}-${browser}.zip`);
    try {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM') {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            zipPath = path.join(outDir, `homy-${version}-${browser}-${stamp}.zip`);
            console.warn(`[build] ${browser} zip locked, writing to ${path.basename(zipPath)} instead. Close the browser/folder using the old zip.`);
        } else {
            throw err;
        }
    }
    zipDir(staging, zipPath);
    fs.rmSync(staging, { recursive: true, force: true });
    return zipPath;
}

const version = process.env.HOMY_VERSION || readVersion();
const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const artifacts = [
    buildBrowser('chrome', version, outDir),
    buildBrowser('firefox', version, outDir),
    buildBrowser('opera', version, outDir),
];

console.log('Built:');
artifacts.forEach((p) => console.log(' ', p));
