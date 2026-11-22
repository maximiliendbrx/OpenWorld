import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

/** Fenêtre de confirmation avant une suppression. Le focus est mis sur « Annuler » pour éviter une validation par erreur. */
export default function ConfirmDialog({ title, message, confirmLabel = 'Supprimer', onConfirm, onCancel }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <div className="modal-backdrop confirm-backdrop" onClick={e => { e.stopPropagation(); onCancel(); }}>
    <div className="help-modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <span className="confirm-icon" aria-hidden="true"><Trash2 size={22}/></span>
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-text">{message}</p>
      <div className="confirm-actions"><button ref={cancel} className="confirm-cancel" onClick={onCancel}>Annuler</button><button className="confirm-ok" onClick={onConfirm}>{confirmLabel}</button></div>
    </div>
  </div>;
}
