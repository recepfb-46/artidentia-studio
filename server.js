'use strict';
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const production = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '.local-data'));
const uploadDir = path.join(dataDir, 'uploads');
if (production && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)) {
  console.error('Production requires ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters).');
  process.exit(1);
}
fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
const db = new Database(path.join(dataDir, 'artidentia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'customer', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, service TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Alındı', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prices (
 service TEXT PRIMARY KEY, price TEXT NOT NULL
);
`);
if (!db.prepare('PRAGMA table_info(files)').all().some(col => col.name === 'direction')) {
  db.exec("ALTER TABLE files ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'");
}
const now = () => new Date().toISOString();
const normEmail = e => String(e || '').trim().toLowerCase();
const id = () => crypto.randomUUID();
const passwordHash = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (password, stored) => {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash || hash.length !== 128) return false;
    return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
  } catch { return false; }
};
const adminEmail = normEmail(process.env.ADMIN_EMAIL);
if (adminEmail) {
  const found = db.prepare('SELECT id, role FROM users WHERE email=?').get(adminEmail);
  if (!found) {
    db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(id(), adminEmail, passwordHash(process.env.ADMIN_PASSWORD), 'admin', now());
  } else if (found.role !== 'admin') {
    console.error('ADMIN_EMAIL belongs to an existing non-admin account. Refusing to elevate automatically.');
    process.exit(1);
  }
}
const defaultPrices = [
  ['Surgical Guide — çene', ''], ['Surgical Guide — implant başına', ''],
  ['Custom Abutment', ''], ['Kron & Köprü Tasarımı', ''],
  ['Splint', ''], ['Ortodontik Tasarım', '']
];
const addPrice = db.prepare('INSERT OR IGNORE INTO prices(service,price) VALUES(?,?)');
defaultPrices.forEach(item => addPrice.run(...item));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  hsts: production ? { maxAge: 31536000, includeSubDomains: false } : false
}));
// Reject cross-origin state changes even if a browser sends cookies.
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('Origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expected) return res.status(403).json({ error: 'İzin verilmeyen kaynak.' });
  if (!origin && req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: 'İzin verilmeyen kaynak.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: production ? '1h' : 0, etag: true }));

const rate = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' }
});
const cookieName = 'artidentia_session';
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const eq = p.indexOf('='); if (eq > 0) out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  });
  return out;
}
function setSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiration = Date.now() + 7 * 86400 * 1000;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(crypto.createHash('sha256').update(token).digest('hex'), user.id, expiration);
  const cookies = [`${cookieName}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=604800'];
  if (production) cookies.push('Secure');
  res.setHeader('Set-Cookie', cookies.join('; '));
}
function deleteSession(req, res) {
  const raw = parseCookies(req)[cookieName];
  if (raw) db.prepare('DELETE FROM sessions WHERE token_hash=?')
    .run(crypto.createHash('sha256').update(raw).digest('hex'));
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`);
}
app.use((req, res, next) => {
  const raw = parseCookies(req)[cookieName];
  if (raw && /^[0-9a-f]{64}$/.test(raw)) {
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    req.user = db.prepare(`SELECT users.id,users.email,users.role FROM sessions
      JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?`)
      .get(tokenHash, Date.now()) || null;
  }
  next();
});
const loginRequired = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Yetkiniz yok.' });
const safeEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const safePass = p => typeof p === 'string' && p.length >= 12 && p.length <= 200;
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Artidentia Studio' }));
app.get('/api/me', (req, res) => res.json({ user: req.user || null }));
app.post('/api/register', rate, (req, res) => {
  const email = normEmail(req.body?.email), password = req.body?.password;
  if (!safeEmail(email) || !safePass(password)) return res.status(400).json({ error: 'Geçerli e-posta ve en az 12 karakterli şifre girin.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });
  const user = { id: id(), email, role: 'customer' };
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(user.id, email, passwordHash(password), user.role, now());
  setSession(res, user);
  res.status(201).json({ user });
});
app.post('/api/login', rate, (req, res) => {
  const email = normEmail(req.body?.email), password = req.body?.password;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
  }
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  setSession(res, user);
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});
app.post('/api/logout', loginRequired, (req, res) => { deleteSession(req, res); res.json({ ok: true }); });
const allowedExt = new Set(['.stl', '.ply', '.obj', '.3mf', '.zip', '.rar', '.7z', '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.dcm', '.dicom']);
const uploader = multer({
  storage: multer.diskStorage({ destination: (_r,_f,cb)=>cb(null, uploadDir), filename: (_r,_f,cb)=>cb(null, `${id()}.upload`) }),
  limits: { files: 8, fileSize: 150 * 1024 * 1024, fields: 5, fieldSize: 5000, parts: 15 },
  fileFilter: (_req,file,cb) => {
    if (!allowedExt.has(path.extname(file.originalname).toLowerCase())) return cb(new Error('Desteklenmeyen dosya uzantısı.'));
    cb(null, true);
  }
}).array('files', 8);
function cleanup(files) { for (const f of files || []) { try { fs.unlinkSync(f.path); } catch {} } }
app.post('/api/jobs', loginRequired, rateLimit({windowMs:60*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Saatlik dosya gönderme sınırına ulaşıldı.'}}), (req, res) => {
  uploader(req, res, err => {
    if (err) { cleanup(req.files); return res.status(400).json({ error: err.message || 'Dosya yükleme hatası.' }); }
    const title = String(req.body?.title || '').trim().slice(0, 100);
    const service = String(req.body?.service || '').trim().slice(0, 100);
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);
    if (!title || !service || !(req.files || []).length) {
      cleanup(req.files); return res.status(400).json({ error: 'İş adı, hizmet ve en az bir dosya gerekli.' });
    }
    const jobId = id();
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO jobs(id,user_id,title,service,notes,status,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(jobId, req.user.id, title, service, notes, 'Alındı', now());
        const add = db.prepare('INSERT INTO files(id,job_id,original_name,stored_name,mime,size) VALUES(?,?,?,?,?,?)');
        for (const file of req.files) add.run(id(), jobId, path.basename(file.originalname).slice(0, 220), file.filename, file.mimetype, file.size);
      })();
      res.status(201).json({ ok: true, id: jobId });
    } catch (error) { cleanup(req.files); console.error(error); res.status(500).json({ error: 'İş kaydedilemedi.' }); }
  });
});
app.get('/api/jobs', loginRequired, (req, res) => {
  const rows = req.user.role === 'admin' ?
    db.prepare(`SELECT jobs.*, users.email customer_email FROM jobs JOIN users ON users.id=jobs.user_id ORDER BY jobs.created_at DESC LIMIT 500`).all() :
    db.prepare(`SELECT jobs.*, users.email customer_email FROM jobs JOIN users ON users.id=jobs.user_id WHERE jobs.user_id=? ORDER BY jobs.created_at DESC LIMIT 500`).all(req.user.id);
  const filesStmt = db.prepare('SELECT id,original_name,size,direction FROM files WHERE job_id=?');
  res.json({ jobs: rows.map(j => ({ ...j, files: filesStmt.all(j.id) })) });
});
app.post('/api/admin/jobs/:jobId/deliver', loginRequired, adminOnly, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id=?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error:'İş bulunamadı.' });
  uploader(req, res, err => {
    if (err) { cleanup(req.files); return res.status(400).json({error:err.message || 'Yükleme hatası.'}); }
    if (!(req.files || []).length) return res.status(400).json({error:'En az bir teslim dosyası gerekli.'});
    try {
      db.transaction(() => {
        const add = db.prepare('INSERT INTO files(id,job_id,original_name,stored_name,mime,size,direction) VALUES(?,?,?,?,?,?,?)');
        for (const file of req.files) add.run(id(),job.id,path.basename(file.originalname).slice(0,220),file.filename,file.mimetype,file.size,'outgoing');
        db.prepare('UPDATE jobs SET status=? WHERE id=?').run('Teslim edildi',job.id);
      })();
      res.status(201).json({ok:true,uploaded:req.files.length});
    } catch(error) {cleanup(req.files);console.error(error);res.status(500).json({error:'Teslim dosyaları kaydedilemedi.'});}
  });
});
app.get('/api/files/:fileId', loginRequired, (req, res) => {
  const file = db.prepare('SELECT files.*,jobs.user_id FROM files JOIN jobs ON jobs.id=files.job_id WHERE files.id=?').get(req.params.fileId);
  if (!file || (req.user.role !== 'admin' && file.user_id !== req.user.id)) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  const target = path.join(uploadDir, file.stored_name);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Dosya depoda bulunamadı.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.download(target, file.original_name);
});
const statuses = new Set(['Alındı', 'İnceleniyor', 'Tasarımda', 'Kontrolde', 'Tamamlandı', 'Teslim edildi']);
app.patch('/api/admin/jobs/:jobId', loginRequired, adminOnly, (req, res) => {
  if (!statuses.has(req.body?.status)) return res.status(400).json({ error: 'Geçersiz iş durumu.' });
  const updated = db.prepare('UPDATE jobs SET status=? WHERE id=?').run(req.body.status, req.params.jobId);
  res.status(updated.changes ? 200 : 404).json(updated.changes ? { ok: true } : { error: 'İş bulunamadı.' });
});
app.get('/api/admin/prices', loginRequired, adminOnly, (_req, res) => res.json({ prices: db.prepare('SELECT service,price FROM prices ORDER BY service ASC').all() }));
app.put('/api/admin/prices', loginRequired, adminOnly, (req, res) => {
  const service = String(req.body?.service || '').trim().slice(0, 100);
  const price = String(req.body?.price || '').trim().slice(0, 100);
  if (!service) return res.status(400).json({ error: 'Hizmet adı gerekli.' });
  db.prepare('INSERT INTO prices(service,price) VALUES(?,?) ON CONFLICT(service) DO UPDATE SET price=excluded.price').run(service, price);
  res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'İstek bulunamadı.' }));
app.use((err, _req, res, _next) => {
  console.error(err?.message || err);
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Geçersiz istek.' });
  res.status(500).json({ error: 'Sunucu hatası.' });
});
// Lazy removal of expired sessions, avoids background jobs.
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`Artidentia Studio listening on :${port}`));
