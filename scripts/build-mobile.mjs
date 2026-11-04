// يبني حزمة الخادم المدمجة داخل تطبيق Android
// Builds the Node.js project embedded in the Android app (runs on nodejs-mobile, Node 18):
//   server bundled into one file with esbuild + data/ + dist/ + the few runtime packages that
//   must stay on disk (sql.js WebAssembly, tiktok-live-connector v1 with its .proto schema).
// Output: android/app/src/main/assets/nodejs-project.zip
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build/mobile/nodejs-project');
const ZIP = path.join(ROOT, 'android/app/src/main/assets/nodejs-project.zip');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) {
  console.error('dist/ is missing — run "npm run build" first');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'server'), { recursive: true });

// 1) the server in one ESM file (config.js resolves ROOT as the parent of server/)
await build({
  entryPoints: [path.join(ROOT, 'server/index.js')],
  outfile: path.join(OUT, 'server/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // v2 needs Node ≥ 20 and is not shipped: the provider falls back to v1 ("legacy").
  external: ['tiktok-live-connector', 'tiktok-live-connector-legacy', 'sql.js', 'bufferutil', 'utf-8-validate'],
  banner: { js: "import { createRequire as __lqgRequire } from 'module'; const require = __lqgRequire(import.meta.url);" },
  logLevel: 'warning',
});

// 2) data + built web UI
fs.cpSync(path.join(ROOT, 'data'), path.join(OUT, 'data'), { recursive: true });
fs.cpSync(path.join(ROOT, 'dist'), path.join(OUT, 'dist'), { recursive: true });

// 3) runtime packages that cannot be bundled
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
  name: 'live-quiz-game-mobile', version: pkg.version, private: true, type: 'module',
  dependencies: { 'sql.js': pkg.dependencies['sql.js'], 'tiktok-live-connector-legacy': pkg.dependencies['tiktok-live-connector-legacy'] },
}, null, 2));
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock', { cwd: OUT, stdio: 'inherit' });

// 4) prune what is never loaded at runtime
const nm = path.join(OUT, 'node_modules');
const keepSql = new Set(['sql-wasm.js', 'sql-wasm.wasm', 'sql-asm.js']);
for (const f of fs.readdirSync(path.join(nm, 'sql.js/dist'))) if (!keepSql.has(f)) fs.rmSync(path.join(nm, 'sql.js/dist', f), { recursive: true });
for (const p of ['protobufjs/dist', 'protobufjs/cli', '@types']) fs.rmSync(path.join(nm, p), { recursive: true, force: true });
const junk = (name) => /\.(md|markdown|map|d\.ts|ts|flow|txt)$/i.test(name) && !/^license/i.test(name);
const junkDir = (name) => /^(test|tests|__tests__|docs?|examples?|\.github|bench(mark)?s?)$/i.test(name);
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (junkDir(e.name)) fs.rmSync(p, { recursive: true }); else walk(p); }
    else if (junk(e.name)) fs.rmSync(p);
  }
})(nm);

// 5) zip
fs.mkdirSync(path.dirname(ZIP), { recursive: true });
fs.rmSync(ZIP, { force: true });
execSync(`zip -qr -9 "${ZIP}" .`, { cwd: OUT });
const size = (fs.statSync(ZIP).size / 1048576).toFixed(1);
console.log(`✓ ${path.relative(ROOT, ZIP)} (${size} MB)`);
