import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, EyeOff, FolderPlus, MapPin, Pencil, Trash2, Upload, X, Crosshair } from 'lucide-react';
import { DEFAULT_ICON, ICON_GROUPS, MAX_COLLECTIONS, MAX_COLLECTION_POINTS, MAX_LIBRARY_POINTS, collectionFromFile, collectionToKmz, type Collection, type LibraryPoint } from './library';

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [custom, setCustom] = useState('');
  return <div className="icon-picker">
    {ICON_GROUPS.map(group => <div key={group.label} className="icon-group"><span>{group.label}</span><div>{group.icons.map(icon => <button key={icon} type="button" className={icon === value ? 'selected' : ''} aria-label={`Icône ${icon}`} aria-pressed={icon === value} onClick={() => onChange(icon)}>{icon}</button>)}</div></div>)}
    <div className="icon-custom"><input value={custom} maxLength={8} placeholder="Autre émoticône…" aria-label="Autre émoticône" onChange={e => setCustom(e.target.value)}/><button type="button" disabled={!custom.trim()} onClick={() => { onChange(custom.trim()); setCustom(''); }}>Utiliser</button></div>
  </div>;
}

const safeFile = (name: string) => name.replace(/[^a-zA-Z0-9à-ÿ_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'points';

export default function PointLibrary({ library, onChange, activeIds, onToggle, onClose, onPlace, onFocus, initialEdit }: { library: Collection[]; onChange: (next: Collection[]) => void; activeIds: string[]; onToggle: (id: string) => void; onClose: () => void; onPlace: (collectionId: string) => void; onFocus: (points: LibraryPoint[]) => void; initialEdit?: { collectionId: string; pointId: string } | null }) {
  const [openId, setOpenId] = useState<string | null>(initialEdit?.collectionId ?? null);
  const [editId, setEditId] = useState<string | null>(initialEdit?.pointId ?? null);
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const total = library.reduce((sum, c) => sum + c.points.length, 0);
  const collection = library.find(c => c.id === openId) ?? null;
  const point = collection?.points.find(p => p.id === editId) ?? null;
  useEffect(() => { if (openId && !collection) { setOpenId(null); setEditId(null); } }, [openId, collection]);

  const patchCollection = (id: string, patch: (c: Collection) => Collection) => onChange(library.map(c => c.id === id ? { ...patch(c), updatedAt: new Date().toISOString() } : c));
  const patchPoint = (patch: Partial<LibraryPoint>) => { if (collection && point) patchCollection(collection.id, c => ({ ...c, points: c.points.map(p => p.id === point.id ? { ...p, ...patch } : p) })); };
  const createCollection = () => {
    const name = newName.trim();
    if (!name) { setMessage('Donnez un nom à la collection.'); return; }
    if (library.length >= MAX_COLLECTIONS) { setMessage(`Limite de ${MAX_COLLECTIONS} collections atteinte.`); return; }
    const created: Collection = { id: crypto.randomUUID(), name: name.slice(0, 100), updatedAt: new Date().toISOString(), points: [] };
    onChange([created, ...library]); setNewName(''); setOpenId(created.id); setMessage('');
  };
  const importFile = async (f: File) => {
    setMessage('');
    if (f.size > 30 * 1024 * 1024) { setMessage('Le fichier dépasse la limite de 30 Mo.'); return; }
    if (library.length >= MAX_COLLECTIONS) { setMessage(`Limite de ${MAX_COLLECTIONS} collections atteinte.`); return; }
    try {
      const imported = collectionFromFile(new Uint8Array(await f.arrayBuffer()), f.name);
      if (imported.points.length > MAX_COLLECTION_POINTS) throw new Error(`Ce fichier contient plus de ${MAX_COLLECTION_POINTS} points.`);
      if (total + imported.points.length > MAX_LIBRARY_POINTS) throw new Error(`Votre bibliothèque est limitée à ${MAX_LIBRARY_POINTS} points au total.`);
      onChange([imported, ...library]); onToggle(imported.id); onFocus(imported.points);
      setMessage(`« ${imported.name} » importé : ${imported.points.length} point${imported.points.length > 1 ? 's' : ''}, affiché${imported.points.length > 1 ? 's' : ''} sur le parcours.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Impossible de lire ce fichier.'); }
  };
  const download = (c: Collection) => {
    const url = URL.createObjectURL(new Blob([collectionToKmz(c)], { type: 'application/vnd.google-earth.kmz' }));
    const link = document.createElement('a'); link.href = url; link.download = `${safeFile(c.name)}.kmz`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const removeCollection = (c: Collection) => { if (!window.confirm(`Supprimer la collection « ${c.name} » et ses ${c.points.length} point(s) ? Cette action est définitive.`)) return; if (activeIds.includes(c.id)) onToggle(c.id); onChange(library.filter(x => x.id !== c.id)); };
  const removePoint = () => { if (!collection || !point) return; if (!window.confirm(`Supprimer « ${point.name || 'ce point'} » ?`)) return; patchCollection(collection.id, c => ({ ...c, points: c.points.filter(p => p.id !== point.id) })); setEditId(null); };

  return <div className="modal-backdrop" onClick={onClose}><div className="help-modal library-modal" role="dialog" aria-modal="true" aria-label="Mes points" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <button autoFocus className="modal-close icon-button" aria-label="Fermer" onClick={onClose}><X/></button>
    {!collection && <>
      <span className="eyebrow">BIBLIOTHÈQUE</span><h2>Mes points</h2>
      <p>Conservez vos fichiers KMZ et vos points importants (cols, côtes, points de vue, ravitaillements…) pour les réutiliser sur tous vos parcours.</p>
      <div className="lib-actions"><input ref={file} type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" hidden onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void importFile(f); }}/><button className="import-button" onClick={() => file.current?.click()}><Upload size={16}/> Importer un KMZ / KML</button></div>
      <div className="lib-new"><input value={newName} maxLength={100} placeholder="Nom d’une nouvelle collection (ex. Cols des Alpes)" aria-label="Nom de la nouvelle collection" onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createCollection(); }}/><button onClick={createCollection}><FolderPlus size={16}/> Créer</button></div>
      {message && <p className="storage-notice" role="status">{message}</p>}
      {library.length === 0 ? <p className="lib-empty">Aucune collection pour le moment. Importez un fichier ou créez votre première collection.</p> : <ul className="lib-list">{library.map(c => <li key={c.id}>
        <button className="lib-open" onClick={() => setOpenId(c.id)}><span className="lib-icons">{[...new Set(c.points.map(p => p.icon))].slice(0, 4).join('') || '📂'}</span><span><strong>{c.name}</strong><small>{c.points.length} point{c.points.length > 1 ? 's' : ''}</small></span></button>
        <button className={`lib-eye${activeIds.includes(c.id) ? ' on' : ''}`} aria-pressed={activeIds.includes(c.id)} title={activeIds.includes(c.id) ? 'Masquer sur ce parcours' : 'Afficher sur ce parcours'} onClick={() => onToggle(c.id)}>{activeIds.includes(c.id) ? <Eye size={16}/> : <EyeOff size={16}/>}<span>{activeIds.includes(c.id) ? 'Sur la carte' : 'Afficher'}</span></button>
        <button className="icon-button" aria-label={`Télécharger ${c.name} en KMZ`} title="Télécharger en KMZ" onClick={() => download(c)}><Download size={16}/></button>
        <button className="icon-button" aria-label={`Supprimer ${c.name}`} title="Supprimer" onClick={() => removeCollection(c)}><Trash2 size={16}/></button>
      </li>)}</ul>}
      <div className="help-note">{total} point{total > 1 ? 's' : ''} sur {MAX_LIBRARY_POINTS.toLocaleString('fr-FR')} au maximum. « Afficher » montre la collection sur le parcours en cours uniquement.</div>
    </>}
    {collection && !point && <>
      <button className="lib-back" onClick={() => { setOpenId(null); setMessage(''); setRenaming(false); }}><ArrowLeft size={16}/> Mes collections</button>
      {!renaming ? <div className="lib-title"><h2>{collection.name || 'Sans nom'}</h2><button className="lib-rename" aria-label="Renommer la collection" title="Renommer" onClick={() => { setDraftName(collection.name); setRenaming(true); }}><Pencil size={15}/> Renommer</button></div>
        : <div className="lib-title editing"><input id="coll-name" className="lib-input" autoFocus aria-label="Nouveau nom de la collection" value={draftName} maxLength={100} onChange={e => setDraftName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (draftName.trim()) { patchCollection(collection.id, c => ({ ...c, name: draftName.trim() })); setRenaming(false); } } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }}/><button className="lib-ok" disabled={!draftName.trim()} onClick={() => { patchCollection(collection.id, c => ({ ...c, name: draftName.trim() })); setRenaming(false); }}>Valider</button><button className="lib-cancel" onClick={() => setRenaming(false)}>Annuler</button></div>}
      <div className="lib-actions"><button className="import-button" onClick={() => onPlace(collection.id)}><Crosshair size={16}/> Placer un point sur la carte</button><button className="import-button" onClick={() => download(collection)}><Download size={16}/> Télécharger en KMZ</button><button className={`import-button${activeIds.includes(collection.id) ? ' on' : ''}`} onClick={() => onToggle(collection.id)}>{activeIds.includes(collection.id) ? <><EyeOff size={16}/> Masquer sur ce parcours</> : <><Eye size={16}/> Afficher sur ce parcours</>}</button></div>
      {collection.points.length === 0 ? <p className="lib-empty">Aucun point. Cliquez sur « Placer un point sur la carte », puis sur l’endroit voulu.</p> : <ul className="lib-points">{collection.points.map(p => <li key={p.id}><button onClick={() => setEditId(p.id)}><span className="lib-emoji">{p.icon}</span><span><strong>{p.name || 'Sans nom'}</strong><small>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</small></span></button><button className="icon-button" aria-label={`Voir ${p.name} sur la carte`} title="Voir sur la carte" onClick={() => { onFocus([p]); if (!activeIds.includes(collection.id)) onToggle(collection.id); onClose(); }}><MapPin size={16}/></button></li>)}</ul>}
    </>}
    {collection && point && <>
      <button className="lib-back" onClick={() => setEditId(null)}><ArrowLeft size={16}/> {collection.name}</button>
      <h2><span className="lib-emoji big">{point.icon}</span> Modifier le point</h2>
      <label className="lib-label" htmlFor="pt-name">Nom</label>
      <input id="pt-name" className="lib-input" value={point.name} maxLength={120} onChange={e => patchPoint({ name: e.target.value })}/>
      <label className="lib-label" htmlFor="pt-desc">Note (facultatif)</label>
      <textarea id="pt-desc" className="lib-input" rows={3} maxLength={500} value={point.description ?? ''} onChange={e => patchPoint({ description: e.target.value || undefined })}/>
      <span className="lib-label">Icône</span>
      <IconPicker value={point.icon} onChange={icon => patchPoint({ icon: icon || DEFAULT_ICON })}/>
      <div className="lib-coords"><label>Latitude<input type="number" step="0.00001" value={point.lat} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.abs(v) <= 90) patchPoint({ lat: v }); }}/></label><label>Longitude<input type="number" step="0.00001" value={point.lng} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.abs(v) <= 180) patchPoint({ lng: v }); }}/></label></div>
      <div className="lib-actions"><button className="import-button" onClick={() => setEditId(null)}>Terminé</button><button className="danger-button" onClick={removePoint}><Trash2 size={15}/> Supprimer ce point</button></div>
    </>}
  </div></div>;
}
