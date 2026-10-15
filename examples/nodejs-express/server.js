import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import 'dotenv/config';

const {
  KEYCLOAK_ISSUER,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  REDIRECT_URI = 'http://localhost:3000/callback',
  POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/',
  SESSION_SECRET,
  PROFILE_API_URL, // ไม่บังคับ: endpoint ของ RMUTI API ที่ต้องการเรียกด้วย token
  PORT = 3000,
} = process.env;

for (const [name, value] of Object.entries({ KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, SESSION_SECRET })) {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
}

const OIDC = `${KEYCLOAK_ISSUER}/protocol/openid-connect`;
const SCOPE = 'openid profile email';

const app = express();
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
  // หมายเหตุ: MemoryStore ใช้สำหรับตัวอย่างเท่านั้น ระบบจริงควรใช้ Redis ฯลฯ
}));

// ---------- helpers ----------

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base64url = (buf) => buf.toString('base64url');
const sessionCall = (fn) => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

async function postToken(params) {
  const res = await fetch(`${OIDC}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: KEYCLOAK_CLIENT_ID, client_secret: KEYCLOAK_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token endpoint error ${res.status}`);
  return data;
}

function toTokenSet(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// คืน access token ที่ยังไม่หมดอายุ (ถ้าหมดจะใช้ refresh token ขอใหม่ให้อัตโนมัติ)
async function getAccessToken(req) {
  const tokens = req.session.tokens;
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 30_000) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  const fresh = toTokenSet(await postToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
  req.session.tokens = { ...tokens, ...fresh, id_token: fresh.id_token ?? tokens.id_token };
  return req.session.tokens.access_token;
}

const page = (body) => `<!doctype html><meta charset="utf-8"><title>RMUTI Passport - Node.js</title>${body}`;

// ---------- routes ----------

app.get('/', (req, res) => {
  const profile = req.session.profile;
  if (!profile) {
    return res.send(page('<h1>RMUTI Passport (Node.js)</h1><a href="/login">Login with RMUTI Passport</a>'));
  }
  res.send(page(`
    <h1>Login Success</h1>
    <h2>Profile จาก Keycloak (userinfo)</h2>
    <pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre>
    ${PROFILE_API_URL ? '<p><a href="/rmuti-api">เรียก RMUTI API ด้วย token</a></p>' : ''}
    <form method="post" action="/logout"><button>Logout</button></form>
  `));
});

// 1) ส่งผู้ใช้ไปหน้า login ของ Keycloak (Authorization Code + state + PKCE)
app.get('/login', (req, res) => {
  const state = base64url(crypto.randomBytes(16));
  const codeVerifier = base64url(crypto.randomBytes(32));
  req.session.oauth = { state, codeVerifier };

  res.redirect(`${OIDC}/auth?` + new URLSearchParams({
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    state,
    code_challenge: base64url(crypto.createHash('sha256').update(codeVerifier).digest()),
    code_challenge_method: 'S256',
  }));
});

// 2) Keycloak ส่งกลับมาพร้อม code -> แลก token -> ขอ profile จาก userinfo
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const oauth = req.session.oauth;
  if (error) return res.status(400).send(`Login failed: ${escapeHtml(error)}`);
  if (!code || !oauth || state !== oauth.state) return res.status(400).send('Invalid login state');

  try {
    const tokens = toTokenSet(await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: oauth.codeVerifier,
    }));

    const userinfoRes = await fetch(`${OIDC}/userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!userinfoRes.ok) throw new Error(`Userinfo error ${userinfoRes.status}`);
    const profile = await userinfoRes.json();

    await sessionCall((cb) => req.session.regenerate(cb)); // ป้องกัน session fixation
    req.session.profile = profile;
    req.session.tokens = tokens;
    await sessionCall((cb) => req.session.save(cb));
    res.redirect('/');
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).send('Authentication failed');
  }
});

// 3) ตัวอย่างเรียก RMUTI API ด้วย access token
app.get('/rmuti-api', async (req, res) => {
  if (!PROFILE_API_URL) return res.status(404).send('PROFILE_API_URL is not configured');
  try {
    const accessToken = await getAccessToken(req);
    if (!accessToken) return res.redirect('/login');

    const apiRes = await fetch(PROFILE_API_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!apiRes.ok) return res.status(apiRes.status).send(`RMUTI API error ${apiRes.status}`);
    const data = await apiRes.json();
    res.send(page(`<h1>RMUTI API</h1><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre><a href="/">กลับ</a>`));
  } catch (err) {
    console.error('RMUTI API error:', err);
    res.redirect('/login'); // refresh token หมดอายุ -> ให้ login ใหม่
  }
});

// 4) Logout: ล้าง session ในแอป และจบ SSO session ที่ Keycloak
app.post('/logout', async (req, res) => {
  const idToken = req.session.tokens?.id_token;
  await sessionCall((cb) => req.session.destroy(cb));
  res.clearCookie('connect.sid');

  const params = new URLSearchParams({ post_logout_redirect_uri: POST_LOGOUT_REDIRECT_URI, client_id: KEYCLOAK_CLIENT_ID });
  if (idToken) params.set('id_token_hint', idToken);
  res.redirect(`${OIDC}/logout?${params}`);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
