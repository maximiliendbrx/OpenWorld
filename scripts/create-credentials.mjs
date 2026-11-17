import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Exécutez cette commande dans un terminal interactif.');
  process.exit(1);
}
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const readline = createInterface({ input: process.stdin, output, terminal: true });
try {
  const username = (await readline.question('Choisissez votre identifiant : ')).trim();
  hidden = true;
  process.stdout.write('Choisissez un mot de passe (16 caractères minimum, saisie masquée) : ');
  const password = await readline.question('');
  process.stdout.write('\nConfirmez le mot de passe : ');
  const confirmation = await readline.question('');
  process.stdout.write('\n');
  hidden = false;
  if (!username || username.length > 128) throw new Error('L’identifiant doit contenir entre 1 et 128 caractères.');
  if (password.length < 16 || password.length > 1024) throw new Error('Le mot de passe doit contenir entre 16 et 1 024 caractères.');
  if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.');
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  console.log('\nAjoutez ces trois valeurs comme secrets Cloudflare Workers (ne les partagez pas) :');
  console.log(`AUTH_USERNAME=${username}`);
  console.log(`AUTH_PASSWORD_VERIFIER=v1:${salt.toString('base64url')}:${hash.toString('base64url')}`);
  console.log(`AUTH_SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : 'Configuration impossible.'}`);
  process.exitCode = 1;
} finally { readline.close(); }
