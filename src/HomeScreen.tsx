import { FolderOpen, MapPin, Plus, Trash2, ArrowRight, Pencil } from 'lucide-react';
import type { Collection } from './library';
import { ActivityIcon } from './NewRouteModal';
import type { SavedRoute } from './storage';
import type { Activity } from './routing';
import { FREE_SAVED_LIMIT, type Plan } from './plan';

export type DraftInfo = { name: string; activity: Activity; points: number };
const label = (activity: Activity) => activity === 'road' ? 'Route' : activity === 'gravel' ? 'Gravel' : 'VTT';

function stats(entry: SavedRoute) {
  const route = entry.snapshot.cached?.route;
  const km = route && route.distance > 0 ? (route.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : null;
  const ascents = route?.legAscents;
  const up = ascents && ascents.length && ascents.every(value => value !== null) ? Math.round((ascents as number[]).reduce((sum, value) => sum + value, 0)) : null;
  return { km, up };
}

export default function HomeScreen({ firstName, routes, draft, plan, onNew, onOpen, onResume, onDelete, library, onOpenList }: { firstName: string; routes: SavedRoute[]; draft: DraftInfo | null; plan: Plan; onNew: () => void; onOpen: (entry: SavedRoute) => void; onResume: () => void; onDelete: (entry: SavedRoute) => void; library: Collection[]; onOpenList: (id: string | null) => void }) {
  return <main className="home" aria-label="Accueil">
    <div className="home-inner">
      <section className="home-hero">
        <span className="eyebrow">{routes.length || draft ? 'CONTENT DE VOUS REVOIR' : 'BIENVENUE'}</span>
        <h1>{firstName ? `Bonjour ${firstName}.` : 'Bonjour.'}</h1>
        <p>{routes.length || draft ? 'Reprenez un de vos tracés ou partez sur une nouvelle aventure.' : 'Créez votre premier parcours : choisissez un point de départ, tracez, puis exportez en GPX.'}</p>
        <button className="home-new" onClick={onNew}><Plus size={18}/> {routes.length || draft ? 'Nouveau tracé' : 'Créer mon premier parcours'}</button>
      </section>
      {draft && <section className="home-draft"><div><span className="home-chip">Brouillon en cours</span><strong>{draft.name || 'Sans nom'}</strong><small><ActivityIcon activity={draft.activity} size={14}/> {label(draft.activity)} · {draft.points} point{draft.points > 1 ? 's' : ''}</small></div><button className="home-resume" onClick={onResume}><Pencil size={15}/> Reprendre <ArrowRight size={15}/></button></section>}
      <section className="home-routes" aria-label="Mes parcours">
        <div className="home-routes-head"><h2><FolderOpen size={18}/> Mes parcours</h2><span>{plan === 'pro' ? `${routes.length} enregistré${routes.length > 1 ? 's' : ''}` : `${routes.length}/${FREE_SAVED_LIMIT} enregistrés`}</span></div>
        {routes.length === 0 ? <p className="home-empty">Aucun parcours enregistré pour le moment. Vos tracés enregistrés apparaîtront ici.</p> : <ul className="home-grid">{routes.map(entry => { const { km, up } = stats(entry); return <li key={entry.id}>
          <button className="home-card" onClick={() => onOpen(entry)}>
            <span className="home-card-top"><span className="home-activity"><ActivityIcon activity={entry.snapshot.activity} size={15}/> {label(entry.snapshot.activity)}</span><ArrowRight size={16}/></span>
            <strong>{entry.snapshot.name || 'Sans nom'}</strong>
            <span className="home-card-meta">{km ? <b>{km} km</b> : null}{up !== null ? <span>▲ {up.toLocaleString('fr-FR')} m</span> : null}<span>{entry.snapshot.boundaries.length + 1} étape{entry.snapshot.boundaries.length ? 's' : ''}</span></span>
            <small>Modifié le {new Date(entry.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</small>
          </button>
          <button className="home-delete icon-button" aria-label={`Supprimer ${entry.snapshot.name || 'ce parcours'}`} onClick={() => onDelete(entry)}><Trash2 size={16}/></button>
        </li>; })}</ul>}
      </section>
      <section className="home-kmz" aria-label="Mes KMZ">
        <div className="home-routes-head"><h2><MapPin size={18}/> Mes KMZ</h2><span>{library.length} liste{library.length > 1 ? 's' : ''}</span></div>
        <p className="home-kmz-text">Vos lieux importants (cols, points de vue, ravitaillements…). Importez un fichier KMZ ou créez votre liste, sans ouvrir de parcours.</p>
        <ul className="home-grid">{library.map(c => <li key={c.id}><button className="home-card" onClick={() => onOpenList(c.id)}><span className="home-card-top"><span className="home-emojis">{[...new Set(c.points.map(p => p.icon))].slice(0, 5).join(' ') || '📂'}</span><ArrowRight size={16}/></span><strong>{c.name || 'Sans nom'}</strong><span className="home-card-meta"><span>{c.points.length} point{c.points.length > 1 ? 's' : ''}</span></span></button></li>)}
          <li><button className="home-card home-new-card" onClick={() => onOpenList(null)}><Plus size={20}/><strong>Importer ou créer</strong><small>Fichier KMZ ou nouvelle liste</small></button></li></ul>
      </section>
    </div>
  </main>;
}
