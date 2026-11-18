import { useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { FREE_SAVED_LIMIT, type Plan } from './plan';

export type AccountUser = { email: string; name: string; createdAt?: string };

export default function AccountPanel({ user, plan, savedCount, onClose, onDelete }: { user: AccountUser; plan: Plan; savedCount: number; onClose: () => void; onDelete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(''); setOk(false);
    if (password.length < 8) { setMessage('Choisissez un mot de passe d’au moins 8 caractères.'); return; }
    if (password !== confirm) { setMessage('Les deux mots de passe ne sont pas identiques.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage(error.message.toLowerCase().includes('different') ? 'Choisissez un mot de passe différent de l’actuel.' : 'Modification impossible. Ce mot de passe est peut-être trop faible.');
      else { setPassword(''); setConfirm(''); setOk(true); setMessage('Mot de passe modifié.'); }
    } catch { setMessage('Modification impossible. Vérifiez votre connexion Internet.'); }
    finally { setBusy(false); }
  };
  const since = user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return <div className="modal-backdrop" onClick={onClose}><div className="help-modal account-panel" role="dialog" aria-modal="true" aria-label="Mon espace" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <button className="modal-close" aria-label="Fermer" onClick={onClose}>×</button>
    <h2>Mon espace</h2>
    <dl className="account-info">
      <div><dt>Nom</dt><dd>{user.name || '—'}</dd></div>
      <div><dt>Adresse e-mail</dt><dd>{user.email}</dd></div>
      {since && <div><dt>Membre depuis</dt><dd>{since}</dd></div>}
      <div><dt>Offre</dt><dd>{plan === 'pro' ? 'Pro — parcours illimités' : `Gratuite — ${savedCount}/${FREE_SAVED_LIMIT} parcours enregistrés`}</dd></div>
    </dl>
    <h3>Changer le mot de passe</h3>
    <form onSubmit={changePassword}>
      <label htmlFor="acc-pass">Nouveau mot de passe</label>
      <input id="acc-pass" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)}/>
      <label htmlFor="acc-confirm">Confirmer le nouveau mot de passe</label>
      <input id="acc-confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)}/>
      {message && <p className={ok ? 'auth-notice' : 'auth-error'} role={ok ? 'status' : 'alert'}>{message}</p>}
      <button type="submit" className="import-button" disabled={busy}>{busy ? 'Veuillez patienter…' : 'Enregistrer le mot de passe'}</button>
    </form>
    <h3>Supprimer mon compte</h3>
    <p>Supprime définitivement votre compte et tous vos parcours enregistrés. Téléchargez vos sauvegardes avant (Mes parcours créés).</p>
    <button type="button" className="danger-button" onClick={onDelete}>Supprimer mon compte</button>
  </div></div>;
}
