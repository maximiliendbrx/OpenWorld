import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import { CloudStorage, type SyncStatus } from './cloudStorage';
import { createBackend } from './supabaseBackend';
import { supabase } from './supabase';
import { createBackup, restoreBackup, type Backup } from './backup';
import { readDraft, readSaved } from './storage';

type Ready = { storage: CloudStorage; legacy: Backup | null };
export default function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ready, setReady] = useState<Ready | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [refresh, setRefresh] = useState(0);
  const [appVersion, setAppVersion] = useState(0);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); }).catch(() => { if (alive) setSession(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (alive) setSession(next); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) { setReady(null); return; }
    let active = true;
    let storage: CloudStorage | undefined;
    setReady(null); setBootLoading(true); setMessage('');
    const load = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user || userData.user.id !== session.user.id) throw new Error('Votre session a expiré. Reconnectez-vous.');
      const userId = userData.user.id;
      const { data: member, error: memberError } = await supabase.from('openworld_members').select('user_id').eq('user_id', userId).maybeSingle();
      if (memberError) throw new Error('La base OpenWorld n’est pas encore configurée ou est inaccessible.');
      if (!member) throw new Error('Ce compte n’est pas autorisé à accéder à OpenWorld.');
      if (!active) return;
      storage = new CloudStorage(window.localStorage, createBackend(userId), userId, status => { if (active) setSyncStatus(status); });
      await storage.initialize();
      if (!active) { storage.dispose(); return; }
      const draft = readDraft(window.localStorage), savedRoutes = readSaved(window.localStorage);
      const legacy = !storage.hasRemoteOrPending() && (draft !== null || savedRoutes.length > 0) ? { format: 'openworld-backup' as const, version: 1 as const, draft, savedRoutes } : null;
      setReady({ storage, legacy });
    };
    load().catch(error => { if (active) { storage?.dispose(); setMessage(error instanceof Error ? error.message : 'Connexion au compte impossible.'); } }).finally(() => { if (active) setBootLoading(false); });
    return () => { active = false; storage?.dispose(); };
  }, [session?.user.id, refresh]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage('Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.');
      else setPassword('');
    } catch { setMessage('Connexion impossible. Vérifiez votre connexion Internet.'); }
    finally { setLoading(false); }
  };
  const signOut = async () => {
    if (ready && !(await ready.storage.flush()) && !window.confirm('Certaines modifications restent sur cet appareil et ne sont pas encore synchronisées. Vous pourrez les retrouver en vous reconnectant sur cet appareil. Se déconnecter ?')) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) window.alert('Déconnexion impossible. Réessayez.');
  };
  const migrate = () => {
    if (!ready?.legacy) return;
    try {
      restoreBackup(ready.storage, ready.legacy);
      setReady({ ...ready, legacy: null });
    } catch { setMessage('Transfert impossible : le stockage de ce navigateur est plein ou indisponible. Vos anciennes données restent sur cet appareil.'); }
  };
  const downloadLocalBackup = () => {
    if (!ready) return;
    const blob = new Blob([createBackup(readDraft(ready.storage), readSaved(ready.storage))], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'openworld-sauvegarde-locale.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resolve = async (choice: 'local' | 'remote') => {
    if (!ready) return;
    const prompt = choice === 'remote' ? 'Remplacer les modifications locales par la version en ligne ? Téléchargez une sauvegarde locale avant de continuer.' : 'Remplacer la version en ligne par les modifications de cet appareil ?';
    if (!window.confirm(prompt)) return;
    setResolving(true); setMessage('');
    try { await ready.storage.resolveConflict(choice); if (choice === 'remote') setAppVersion(value => value + 1); }
    catch { setMessage('Résolution impossible. Vérifiez votre connexion et réessayez.'); }
    finally { setResolving(false); }
  };

  if (session === undefined || (session && bootLoading && !ready)) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><p>Ouverture de votre espace…</p></main></div>;
  if (!session) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Bienvenue sur OpenWorld</h1><p>Connectez-vous pour retrouver vos parcours.</p><form onSubmit={signIn}><label htmlFor="auth-email">Adresse e-mail</label><input id="auth-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/><label htmlFor="auth-password">Mot de passe</label><input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/>{message && <p className="auth-error" role="alert">{message}</p>}<button type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button></form><small>Votre espace de parcours personnel</small></main></div>;
  if (!ready) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Accès indisponible</h1><p role="alert">{message || 'Impossible de charger votre espace.'}</p><button onClick={() => setRefresh(value => value + 1)}>Réessayer</button><button className="auth-secondary" onClick={() => void signOut()}>Se déconnecter</button></main></div>;
  if (ready.legacy) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Retrouver vos parcours</h1><p>Des parcours ou un brouillon ont été trouvés sur cet appareil. Vous pouvez les copier dans votre compte ; la copie locale d’origine restera intacte.</p>{message && <p className="auth-error" role="alert">{message}</p>}<button onClick={migrate}>Importer mes parcours</button><button className="auth-secondary" onClick={() => setReady({ ...ready, legacy: null })}>Continuer sans importer</button></main></div>;
  return <><App key={`${session.user.id}-${appVersion}`} storage={ready.storage} syncStatus={syncStatus} onSignOut={() => void signOut()}/>{syncStatus === 'conflict' && <div className="modal-backdrop"><div className="help-modal" role="dialog" aria-modal="true" aria-label="Conflit de synchronisation"><h2>Deux versions de vos parcours</h2><p>Le compte a été modifié sur un autre appareil pendant que des modifications étaient en attente ici. Choisissez la version à conserver.</p><button className="import-button" onClick={downloadLocalBackup}>Télécharger la copie de cet appareil</button><button className="import-button" disabled={resolving} onClick={() => void resolve('remote')}>Utiliser la version en ligne</button><button className="import-button" disabled={resolving} onClick={() => void resolve('local')}>Envoyer la version de cet appareil</button>{message && <p className="auth-error" role="alert">{message}</p>}</div></div>}</>;
}
