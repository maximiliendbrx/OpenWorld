import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import { CloudStorage, type SyncStatus } from './cloudStorage';
import { createBackend } from './supabaseBackend';
import { supabase } from './supabase';
import { createBackup, restoreBackup, type Backup } from './backup';
import { readDraft, readSaved } from './storage';
import { deleteAccount, loadPlan, type Plan } from './plan';

const startedInRecovery = /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);
type Ready = { storage: CloudStorage; legacy: Backup | null };
export default function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ready, setReady] = useState<Ready | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [refresh, setRefresh] = useState(0);
  const [appVersion, setAppVersion] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [notice, setNotice] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [accepted, setAccepted] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [recovery, setRecovery] = useState(startedInRecovery);
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); }).catch(() => { if (alive) setSession(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => { if (!alive) return; if (event === 'PASSWORD_RECOVERY') setRecovery(true); setSession(next); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session || recovery) { setReady(null); return; }
    let active = true;
    let storage: CloudStorage | undefined;
    setReady(null); setBootLoading(true); setMessage('');
    const load = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user || userData.user.id !== session.user.id) throw new Error('Votre session a expiré. Reconnectez-vous.');
      const userId = userData.user.id;
      const nextPlan = await loadPlan(userId);
      if (!active) return;
      setPlan(nextPlan);
      storage = new CloudStorage(window.localStorage, createBackend(userId), userId, status => { if (active) setSyncStatus(status); });
      await storage.initialize();
      if (!active) { storage.dispose(); return; }
      const draft = readDraft(window.localStorage), savedRoutes = readSaved(window.localStorage);
      const legacy = !storage.hasRemoteOrPending() && (draft !== null || savedRoutes.length > 0) ? { format: 'openworld-backup' as const, version: 1 as const, draft, savedRoutes } : null;
      setReady({ storage, legacy });
    };
    load().catch(error => { if (active) { storage?.dispose(); setMessage(error instanceof Error ? error.message : 'Connexion au compte impossible.'); } }).finally(() => { if (active) setBootLoading(false); });
    return () => { active = false; storage?.dispose(); };
  }, [session?.user.id, refresh, recovery]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setMessage(''); setNotice('');
    const address = email.trim();
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: window.location.href.split('#')[0] });
        if (error) setMessage('Envoi impossible pour le moment. Réessayez dans quelques minutes.');
        else setNotice('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.');
      } else if (mode === 'signup') {
        if (!firstName.trim() || !lastName.trim()) { setMessage('Renseignez votre prénom et votre nom.'); return; }
        if (password.length < 8) { setMessage('Choisissez un mot de passe d’au moins 8 caractères.'); return; }
        if (password !== confirm) { setMessage('Les deux mots de passe ne sont pas identiques.'); return; }
        if (!accepted) { setMessage('Acceptez les conditions d’utilisation et la politique de confidentialité pour créer un compte.'); return; }
        const { data, error } = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: window.location.href.split('#')[0], data: { first_name: firstName.trim(), last_name: lastName.trim() } } });
        if (error) setMessage(error.message.toLowerCase().includes('registered') ? 'Un compte existe déjà avec cette adresse. Connectez-vous.' : error.message.toLowerCase().includes('password') ? 'Ce mot de passe est trop faible ou a déjà été compromis. Choisissez-en un autre.' : 'Création du compte impossible. Vérifiez l’adresse et le mot de passe.');
        else if (data.session) { setPassword(''); setConfirm(''); }
        else if (data.user && data.user.identities?.length === 0) setMessage('Un compte existe déjà avec cette adresse. Connectez-vous.');
        else {
          // Connexion directe si la confirmation par e-mail est désactivée côté Supabase.
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: address, password });
          if (signInError) { setPassword(''); setConfirm(''); setMessage(''); setPendingEmail(address); }
          else { setPassword(''); setConfirm(''); }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error?.code === 'email_not_confirmed') { setMessage('Votre adresse e-mail n’est pas encore confirmée. Cliquez sur le lien reçu par e-mail (pensez aux courriers indésirables).'); setUnconfirmed(true); }
        else if (error) { setMessage('Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.'); setUnconfirmed(false); }
        else setPassword('');
      }
    } catch { setMessage('Opération impossible. Vérifiez votre connexion Internet.'); }
    finally { setLoading(false); }
  };
  const resend = async () => {
    setLoading(true); setNotice('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: (pendingEmail || email).trim(), options: { emailRedirectTo: window.location.href.split('#')[0] } });
      if (error) setMessage('Renvoi impossible pour le moment. Réessayez dans quelques minutes.'); else { setMessage(''); setNotice('E-mail de confirmation renvoyé.'); }
    } catch { setMessage('Renvoi impossible. Vérifiez votre connexion Internet.'); }
    finally { setLoading(false); }
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage('');
    if (newPassword.length < 8) { setMessage('Choisissez un mot de passe d’au moins 8 caractères.'); return; }
    if (newPassword !== newConfirm) { setMessage('Les deux mots de passe ne sont pas identiques.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setMessage(error.message.toLowerCase().includes('different') ? 'Choisissez un mot de passe différent de l’ancien.' : error.message.toLowerCase().includes('password') ? 'Ce mot de passe est trop faible ou a déjà été compromis. Choisissez-en un autre.' : 'Modification impossible. Le lien a peut-être expiré : demandez-en un nouveau.');
      else { setNewPassword(''); setNewConfirm(''); window.history.replaceState(null, '', window.location.pathname); setRecovery(false); }
    } catch { setMessage('Modification impossible. Vérifiez votre connexion Internet.'); }
    finally { setLoading(false); }
  };
  const cancelRecovery = async () => { window.history.replaceState(null, '', window.location.pathname); setRecovery(false); setMessage(''); await supabase.auth.signOut({ scope: 'local' }); };
  const removeAccount = async () => {
    if (!window.confirm('Supprimer définitivement votre compte et tous vos parcours enregistrés ? Cette action est irréversible. Pensez à télécharger vos sauvegardes avant.')) return;
    try { await deleteAccount(); await supabase.auth.signOut({ scope: 'local' }); }
    catch { window.alert('Suppression impossible pour le moment. Réessayez ou contactez le support.'); }
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

  if (recovery) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Nouveau mot de passe</h1>{session === undefined ? <p>Vérification du lien…</p> : !session ? <><p className="auth-error" role="alert">Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis l’écran de connexion.</p><button type="button" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setRecovery(false); setMode('reset'); }}>Demander un nouveau lien</button></> : <><p>Choisissez le nouveau mot de passe de votre compte.</p><form onSubmit={changePassword}><label htmlFor="new-password">Nouveau mot de passe</label><div className="password-field"><input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)}/><button type="button" className="password-toggle" aria-pressed={showPassword} onClick={() => setShowPassword(visible => !visible)}>{showPassword ? 'Masquer' : 'Afficher'}</button></div><label htmlFor="new-confirm">Confirmer le nouveau mot de passe</label><input id="new-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={newConfirm} onChange={e => setNewConfirm(e.target.value)}/>{newConfirm && newPassword !== newConfirm && <small className="auth-error">Les mots de passe ne correspondent pas.</small>}{message && <p className="auth-error" role="alert">{message}</p>}<button type="submit" disabled={loading}>{loading ? 'Veuillez patienter…' : 'Enregistrer le mot de passe'}</button></form><button type="button" className="auth-secondary" onClick={() => void cancelRecovery()}>Annuler</button></>}</main></div>;
  if (session === undefined || (session && bootLoading && !ready)) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><p>Ouverture de votre espace…</p></main></div>;
  if (!session && pendingEmail) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Confirmez votre adresse e-mail</h1><p>Votre compte est créé. Pour y accéder, ouvrez le message que nous venons d’envoyer à <strong>{pendingEmail}</strong> et cliquez sur le lien de confirmation.</p><p><small>Vous ne le trouvez pas ? Vérifiez vos courriers indésirables, puis demandez un nouvel envoi.</small></p>{message && <p className="auth-error" role="alert">{message}</p>}{notice && <p className="auth-notice" role="status">{notice}</p>}<button type="button" disabled={loading} onClick={() => void resend()}>Renvoyer l’e-mail de confirmation</button><button type="button" className="auth-secondary" onClick={() => { setPendingEmail(''); setMode('signin'); setMessage(''); setNotice(''); }}>J’ai confirmé : me connecter</button></main></div>;
  if (!session) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>{mode === 'signup' ? 'Créer votre compte' : mode === 'reset' ? 'Mot de passe oublié' : 'Bienvenue sur OpenWorld'}</h1><p>{mode === 'signup' ? 'Gratuit : 3 parcours enregistrés. Passez Pro pour en avoir sans limite.' : mode === 'reset' ? 'Recevez un lien pour choisir un nouveau mot de passe.' : 'Connectez-vous pour retrouver vos parcours.'}</p><form onSubmit={submit}>{mode === 'signup' && <div className="auth-row"><div><label htmlFor="auth-first">Prénom</label><input id="auth-first" type="text" autoComplete="given-name" required maxLength={60} value={firstName} onChange={e => setFirstName(e.target.value)}/></div><div><label htmlFor="auth-last">Nom</label><input id="auth-last" type="text" autoComplete="family-name" required maxLength={60} value={lastName} onChange={e => setLastName(e.target.value)}/></div></div>}<label htmlFor="auth-email">Adresse e-mail</label><input id="auth-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/>{mode !== 'reset' && <><label htmlFor="auth-password">Mot de passe</label><div className="password-field"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={e => setPassword(e.target.value)}/><button type="button" className="password-toggle" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} onClick={() => setShowPassword(visible => !visible)}>{showPassword ? "Masquer" : "Afficher"}</button></div>{mode === 'signup' && <><label htmlFor="auth-confirm">Confirmer le mot de passe</label><input id="auth-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)}/>{confirm && password !== confirm && <small className="auth-error">Les mots de passe ne correspondent pas.</small>}</>}</>}{mode === 'signup' && <label className="auth-consent"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>J’accepte les <a href="./legal.html#cgu" target="_blank" rel="noreferrer">conditions d’utilisation</a> et la <a href="./legal.html#confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a>.</span></label>}{message && <p className="auth-error" role="alert">{message}</p>}{unconfirmed && mode === 'signin' && <button type="button" className="auth-secondary" disabled={loading} onClick={() => void resend()}>Renvoyer l’e-mail de confirmation</button>}{notice && <p className="auth-notice" role="status">{notice}</p>}<button type="submit" disabled={loading}>{loading ? 'Veuillez patienter…' : mode === 'signup' ? 'Créer mon compte' : mode === 'reset' ? 'Envoyer le lien' : 'Se connecter'}</button></form><div className="auth-links">{mode !== 'signin' && <button type="button" className="auth-secondary" onClick={() => { setMode('signin'); setMessage(''); setNotice(''); }}>J’ai déjà un compte</button>}{mode !== 'signup' && <button type="button" className="auth-secondary" onClick={() => { setMode('signup'); setMessage(''); setNotice(''); }}>Créer un compte</button>}{mode === 'signin' && <button type="button" className="auth-secondary" onClick={() => { setMode('reset'); setMessage(''); setNotice(''); }}>Mot de passe oublié ?</button>}</div></main></div>;
  if (!ready) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Accès indisponible</h1><p role="alert">{message || 'Impossible de charger votre espace.'}</p><button onClick={() => setRefresh(value => value + 1)}>Réessayer</button><button className="auth-secondary" onClick={() => void signOut()}>Se déconnecter</button></main></div>;
  if (ready.legacy) return <div className="auth-screen"><main className="auth-card"><div className="auth-brand">△ openworld<span>.</span></div><h1>Retrouver vos parcours</h1><p>Des parcours ou un brouillon ont été trouvés sur cet appareil. Vous pouvez les copier dans votre compte ; la copie locale d’origine restera intacte.</p>{message && <p className="auth-error" role="alert">{message}</p>}<button onClick={migrate}>Importer mes parcours</button><button className="auth-secondary" onClick={() => setReady({ ...ready, legacy: null })}>Continuer sans importer</button></main></div>;
  return <><App key={`${session.user.id}-${appVersion}`} storage={ready.storage} syncStatus={syncStatus} plan={plan} onSignOut={() => void signOut()}/>{syncStatus === 'conflict' && <div className="modal-backdrop"><div className="help-modal" role="dialog" aria-modal="true" aria-label="Conflit de synchronisation"><h2>Deux versions de vos parcours</h2><p>Le compte a été modifié sur un autre appareil pendant que des modifications étaient en attente ici. Choisissez la version à conserver.</p><button className="import-button" onClick={downloadLocalBackup}>Télécharger la copie de cet appareil</button><button className="import-button" disabled={resolving} onClick={() => void resolve('remote')}>Utiliser la version en ligne</button><button className="import-button" disabled={resolving} onClick={() => void resolve('local')}>Envoyer la version de cet appareil</button>{message && <p className="auth-error" role="alert">{message}</p>}</div></div>}</>;
}
