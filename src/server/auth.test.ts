import { beforeAll, describe, expect, it, vi } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { authenticate, passwordVerifier, type AuthConfig } from './auth';

const origin = 'https://openworld.example';
const success = { limit: async () => ({ success: true }) };
let env: AuthConfig;
const next = vi.fn(async () => new Response('application privée', { headers: { 'Cache-Control': 'public' } }));
const request = (path: string, options?: RequestInit) => new Request(`${origin}${path}`, options);
const login = (username = 'velo', password = 'une phrase secrète très longue') => request('/connexion', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '203.0.113.1' }, body: new URLSearchParams({ username, password }) });
beforeAll(async () => { env = { AUTH_USERNAME: 'velo', AUTH_PASSWORD_VERIFIER: await passwordVerifier('une phrase secrète très longue', new Uint8Array(16).fill(42)), AUTH_SESSION_SECRET: 'secret-de-session-aleatoire-32-caracteres-minimum', LOGIN_IP_LIMITER: success, LOGIN_GLOBAL_LIMITER: success }; });

describe('protection du site', () => {
  it('utilise le même vérificateur que le script de création des identifiants', async () => {
    const salt = Buffer.alloc(16, 42);
    const expected = `v1:${salt.toString('base64url')}:${pbkdf2Sync('une phrase secrète très longue', salt, 100000, 32, 'sha256').toString('base64url')}`;
    expect(await passwordVerifier('une phrase secrète très longue', salt)).toBe(expected);
  });
  it('refuse tout accès si la configuration ou les limites manquent', async () => {
    expect((await authenticate(request('/assets/app.js'), {}, next)).status).toBe(503);
    expect((await authenticate(request('/'), { ...env, LOGIN_IP_LIMITER: undefined }, next)).status).toBe(503);
  });
  it('redirige les pages et les fichiers sans session vers la connexion', async () => {
    for (const path of ['/', '/index.html', '/assets/app.js', '/assets/style.css']) {
      const response = await authenticate(request(path), env, next);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/connexion');
      expect(await response.text()).not.toContain('application privée');
    }
  });
  it('refuse les identifiants invalides et les soumissions depuis un autre site', async () => {
    expect((await authenticate(login('velo', 'incorrect'), env, next)).status).toBe(401);
    expect((await authenticate(login('autre'), env, next)).status).toBe(401);
    expect((await authenticate(request('/connexion', { method: 'POST', headers: { Origin: 'https://autre.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=velo&password=x' }), env, next)).status).toBe(403);
  });
  it('authentifie, protège les actifs par cookie et déconnecte', async () => {
    const result = await authenticate(login(), env, next);
    expect(result.status).toBe(303);
    const setCookie = result.headers.get('Set-Cookie')!;
    expect(setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const page = await authenticate(request('/assets/app.js', { headers: { Cookie: cookie } }), env, next);
    expect(await page.text()).toBe('application privée');
    expect(page.headers.get('Cache-Control')).toBe('no-store, private');
    const logout = await authenticate(request('/deconnexion', { method: 'POST', headers: { Origin: origin, Cookie: cookie } }), env, next);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await authenticate(request('/', { headers: { Cookie: `${cookie}x` } }), env, next)).status).toBe(303);
    expect((await authenticate(request('/', { headers: { Cookie: cookie } }), { ...env, AUTH_USERNAME: 'autre' }, next)).status).toBe(303);
  });
  it('limite les tentatives et échoue fermé si la limite est indisponible', async () => {
    expect((await authenticate(login(), { ...env, LOGIN_IP_LIMITER: { limit: async () => ({ success: false }) } }, next)).status).toBe(429);
    expect((await authenticate(login(), { ...env, LOGIN_GLOBAL_LIMITER: { limit: async () => { throw new Error('indisponible'); } } }, next)).status).toBe(503);
  });
});
