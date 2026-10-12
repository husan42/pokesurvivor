/* ============ gateway.js — pasarela de la versión local ============
 * Un solo puerto (PORT, 8180) para todo, así el proxy de fuera (https://poke.husan.ai)
 * no necesita reglas especiales:
 *
 *   /identitytoolkit.googleapis.com/v1/accounts:*   -> emulador de Auth      (9099)
 *   /securetoken.googleapis.com/v1/token             -> emulador de Auth
 *   /google.firestore.v1.Firestore/*                 -> emulador de Firestore (8085)
 *   /v1/projects/<proyecto>/databases/(default)/documents*  (REST del ranking)
 *   /.ws  (WebSocket)  ·  /.lp  (long polling)       -> emulador de Realtime Database (9000)
 *   todo lo demás                                     -> archivos del juego (carpeta de arriba)
 *
 * Los emuladores no tienen seguridad de verdad (aceptan tokens sin firmar y tienen
 * rutas de administración), así que aquí:
 *   - se bloquean /emulator/*, las APIs de administración de Auth, el REST de la
 *     Realtime Database y cualquier "Authorization: Bearer owner";
 *   - PUERTA: si server/.gate-password existe, hace falta la contraseña de la casa
 *     una vez por dispositivo (cookie firmada de 1 año) para todo lo demás.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const httpProxy = require('http-proxy');

const PORT = +process.env.PORT || 8180;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const PROJECT = 'demo-pokesurvivor';
const AUTH = 'http://127.0.0.1:9099', FIRESTORE = 'http://127.0.0.1:8085', RTDB = 'http://127.0.0.1:9000';

// ---------------- puerta ----------------
const PASS_FILE = path.join(__dirname, '.gate-password');
const SECRET_FILE = path.join(__dirname, '.gate-secret');
const readTrim = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return ''; } };
function gatePassword() { return readTrim(PASS_FILE); }       // se relee: cambiarla no exige reiniciar
let secret = readTrim(SECRET_FILE);
if (!secret) { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, secret + '\n', { mode: 0o600 }); }
const COOKIE = 'ps_gate', MAX_AGE = 365 * 24 * 3600;
const sign = pass => crypto.createHmac('sha256', secret).update('gate:' + pass).digest('hex');
function cookieOk(req) {
  const pass = gatePassword();
  if (!pass) return true;
  const m = /(?:^|;\s*)ps_gate=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(sign(pass));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Lo que el navegador pide sin cookies (manifiesto e iconos de la app): libre, no tiene nada.
const PUBLIC = /^\/(manifest\.webmanifest|favicon\.ico|robots\.txt|assets\/icons\/[\w.-]+)$/;
const tries = new Map();   // ip -> { n, t }  (máx. 10 intentos cada 10 min)
function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }

const GATE_HTML = (msg = '') => `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PokéSurvivor</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a1430;color:#e8eefc;font:16px system-ui,sans-serif}
form{background:#1b2f78;padding:28px;border-radius:14px;width:min(320px,90vw);box-shadow:0 8px 30px #0008}
h1{margin:0 0 6px;font-size:22px;color:#ffd23f}p{margin:0 0 16px;color:#b9c6e6;font-size:14px}
input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:0;font-size:16px}
input{margin-bottom:12px}button{background:#ffd23f;color:#2a1d00;font-weight:700;cursor:pointer}.e{color:#ff8a8a;min-height:20px}</style></head>
<body><form method="post" action="/__gate"><h1>PokéSurvivor</h1><p>請輸入通關密碼（每台裝置只需輸入一次）</p>
<input type="password" name="p" autofocus autocomplete="current-password"><p class="e">${msg}</p><button>進入</button></form></body></html>`;

function gate(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  const ip = clientIp(req), now = Date.now();
  const t = tries.get(ip) || { n: 0, t: now };
  if (now - t.t > 10 * 60 * 1000) { t.n = 0; t.t = now; }
  if (t.n >= 10) { res.writeHead(429, { 'content-type': 'text/html; charset=utf-8' }); return res.end(GATE_HTML('嘗試太多次，請 10 分鐘後再試')); }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    const p = new URLSearchParams(body).get('p') || '';
    const pass = gatePassword();
    const a = Buffer.from(sign(p)), b = Buffer.from(sign(pass));
    if (pass && crypto.timingSafeEqual(a, b)) {
      tries.delete(ip);
      const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
      res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=${sign(pass)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}` });
      return res.end();
    }
    t.n++; tries.set(ip, t);
    res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
    res.end(GATE_HTML('密碼錯誤'));
  });
}

// ---------------- emuladores ----------------
const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true, proxyTimeout: 0, timeout: 0 });
proxy.on('error', (e, req, res) => {
  console.warn('[proxy]', req.url.slice(0, 80), e.code || e.message);
  if (res && res.writeHead && !res.headersSent) { res.writeHead(502); res.end(); }
  else if (res && res.destroy) res.destroy();
});

const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
function route(req) {
  const u = req.url, p = u.split('?')[0];
  if (/^bearer\s+owner\b/i.test(req.headers.authorization || '')) return 'deny';
  if (p.startsWith('/emulator/') || p.includes('/emulator/')) return 'deny';
  if (p.startsWith('/identitytoolkit.googleapis.com/v1/accounts:')) return AUTH;
  if (p === '/securetoken.googleapis.com/v1/token') return AUTH;
  if (p.startsWith('/identitytoolkit.googleapis.com/') || p.startsWith('/securetoken.googleapis.com/')) return 'deny';
  if (p.startsWith('/google.firestore.v1.Firestore/')) return FIRESTORE;
  if (p === DOCS || p.startsWith(DOCS + '/') || p.startsWith(DOCS + ':')) return FIRESTORE;
  if (p.startsWith('/v1/')) return 'deny';
  if (p === '/.ws' || p === '/.lp') return RTDB;
  if (/[?&]ns=/.test(u)) return 'deny';                      // REST de la Realtime Database
  return null;
}

// ---------------- archivos ----------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const HIDDEN = /^\/(server|tools|functions|cloudflare|docs|node_modules)(\/|$)|\/\./;   // ni .git ni .gate-*

function serveFile(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (HIDDEN.test(p) || p.includes('\0')) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) && f !== ROOT) { res.writeHead(404); return res.end(); }
  fs.stat(f, (e, st) => {
    if (!e && st.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { location: p + '/' }); return res.end(); }
      f = path.join(f, 'index.html');
      return fs.stat(f, (e2, st2) => send(e2, st2));
    }
    send(e, st);
  });
  function send(e, st) {
    if (e || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(fs.existsSync(path.join(ROOT, '404.html')) ? fs.readFileSync(path.join(ROOT, '404.html')) : 'Not found');
    }
    const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size, etag, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).pipe(res);
  }
}

// ---------------- servidor ----------------
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/__gate') return gate(req, res);
  const target = route(req);
  if (target === 'deny') { res.writeHead(403); return res.end(); }
  if (!PUBLIC.test(p) && !cookieOk(req)) {
    const page = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
    res.writeHead(401, page ? { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } : {});
    return res.end(page ? GATE_HTML() : '');
  }
  if (target) return proxy.web(req, res, { target });
  serveFile(req, res);
});
server.on('upgrade', (req, socket, head) => {
  const target = route(req);
  if (target !== RTDB || !cookieOk(req)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
  proxy.ws(req, socket, head, { target });
});
server.listen(PORT, HOST, () => console.log(`[gateway] http://${HOST}:${PORT}  raíz=${ROOT}  puerta=${gatePassword() ? 'sí' : 'no'}`));
