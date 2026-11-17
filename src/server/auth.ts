type Limiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };
export type AuthConfig = { AUTH_USERNAME?: string; AUTH_PASSWORD_VERIFIER?: string; AUTH_SESSION_SECRET?: string; LOGIN_IP_LIMITER?: Limiter; LOGIN_GLOBAL_LIMITER?: Limiter };
const encoder = new TextEncoder();
const ITERATIONS = 100000;
const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE = '__Host-openworld_session';
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function passwordVerifier(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations: ITERATIONS }, key, 256);
  return `v1:${toBase64(salt)}:${toBase64(new Uint8Array(bits))}`;
}

function configured(env: AuthConfig): env is Required<AuthConfig> {
  return Boolean(env.AUTH_USERNAME && env.AUTH_USERNAME.length <= 128 && env.AUTH_SESSION_SECRET && env.AUTH_SESSION_SECRET.length >= 32 && /^v1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/.test(env.AUTH_PASSWORD_VERIFIER || '') && env.LOGIN_IP_LIMITER && env.LOGIN_GLOBAL_LIMITER);
}

async function equal(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function sessionKey(env: Required<AuthConfig>) {
  return crypto.subtle.importKey('raw', encoder.encode(env.AUTH_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function signedMessage(payload: string, env: Required<AuthConfig>) { return encoder.encode(`${payload}:${env.AUTH_USERNAME}:${env.AUTH_PASSWORD_VERIFIER}`); }
async function makeSession(env: Required<AuthConfig>): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expiry}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', await sessionKey(env), signedMessage(payload, env));
  return `${payload}.${toBase64(new Uint8Array(signature))}`;
}
async function validSession(request: Request, env: Required<AuthConfig>): Promise<boolean> {
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 200) return false;
  const parts = cookie.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^\d{10}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const now = Math.floor(Date.now() / 1000), expiry = Number(parts[1]);
  if (expiry <= now || expiry > now + SESSION_SECONDS + 60) return false;
  try { return await crypto.subtle.verify('HMAC', await sessionKey(env), fromBase64(parts[3]), signedMessage(parts.slice(0, 3).join('.'), env)); }
  catch { return false; }
}
const securityHeaders = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };
function loginPage(error = ''): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173f30"><title>Connexion — OpenWorld</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf2e8;color:#233d31;font-family:system-ui,sans-serif;padding:22px}main{width:min(420px,100%);background:#fff;border:1px solid #dfe8db;border-radius:16px;padding:34px;box-shadow:0 14px 50px #233d3215}.brand{font-size:25px;font-weight:800;color:#24533d;letter-spacing:-1px}.brand span{color:#a79058}h1{font-size:27px;letter-spacing:-1px;margin:30px 0 8px}p{font-size:14px;color:#687b6c;line-height:1.6}label{display:block;font-size:12px;font-weight:600;margin:20px 0 7px}input{width:100%;height:46px;border:1px solid #cdd9ca;border-radius:7px;padding:0 12px;font:inherit}input:focus-visible,button:focus-visible{outline:3px solid #b9c99d;outline-offset:2px}button{width:100%;height:48px;margin-top:26px;border:0;border-radius:7px;background:#28583e;color:white;font:600 14px system-ui;cursor:pointer}.error{color:#a23d2e;background:#fff1eb;border-radius:7px;padding:10px;font-size:13px}small{display:block;text-align:center;color:#93a090;font-size:11px;margin-top:24px}</style></head><body><main><div class="brand">△ openworld<span>.</span></div><h1>Bienvenue sur OpenWorld</h1><p>Connectez-vous pour retrouver vos parcours.</p>${error ? '<p class="error" role="alert">Identifiant ou mot de passe incorrect.</p>' : ''}<form method="post" action="/connexion"><label for="username">Identifiant</label><input id="username" name="username" autocomplete="username" maxlength="128" required autofocus><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required><button type="submit">Se connecter</button></form><small>Votre espace de parcours personnel</small></main></body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
}

/** Protect every page and asset; never serve the app if configuration is absent. */
export async function authenticate(request: Request, env: AuthConfig, next: () => Promise<Response>): Promise<Response> {
  if (!configured(env)) return new Response('OpenWorld : la connexion n’est pas encore configurée.', { status: 503, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
  const url = new URL(request.url);
  if (url.pathname === '/connexion' && request.method === 'GET') return loginPage();
  if (url.pathname === '/connexion' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) return new Response('Requête refusée.', { status: 403, headers: securityHeaders });
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip.length > 64) return new Response('Connexion temporairement indisponible.', { status: 503, headers: securityHeaders });
    try {
      const [client, total] = await Promise.all([env.LOGIN_IP_LIMITER.limit({ key: ip }), env.LOGIN_GLOBAL_LIMITER.limit({ key: 'login' })]);
      if (!client.success || !total.success) return new Response('Trop de tentatives. Réessayez dans une minute.', { status: 429, headers: { ...securityHeaders, 'Retry-After': '60' } });
    } catch { return new Response('Connexion temporairement indisponible.', { status: 503, headers: securityHeaders }); }
    const body = await request.text();
    if (body.length > 4096) return new Response('Requête trop volumineuse.', { status: 413, headers: securityHeaders });
    const form = new URLSearchParams(body), username = form.get('username') || '', password = form.get('password') || '';
    if (username.length > 128 || password.length > 1024) return loginPage('invalid');
    const salt = fromBase64(env.AUTH_PASSWORD_VERIFIER.split(':')[1]);
    const verifier = await passwordVerifier(password, salt);
    const [validUser, validPassword] = await Promise.all([equal(username, env.AUTH_USERNAME), equal(verifier, env.AUTH_PASSWORD_VERIFIER)]);
    if (!validUser || !validPassword) return loginPage('invalid');
    const session = await makeSession(env);
    return new Response(null, { status: 303, headers: { ...securityHeaders, Location: '/', 'Set-Cookie': `${COOKIE}=${session}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict` } });
  }
  if (url.pathname === '/deconnexion' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return new Response('Requête refusée.', { status: 403, headers: securityHeaders });
    return new Response(null, { status: 303, headers: { ...securityHeaders, Location: '/connexion', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` } });
  }
  if (!(await validSession(request, env))) return new Response(null, { status: 303, headers: { ...securityHeaders, Location: '/connexion' } });
  const response = await next();
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
