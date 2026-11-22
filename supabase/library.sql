-- HorizonsGPX : autorise le document « library » (bibliothèque de points KMZ de chaque utilisateur).
-- Déjà appliqué sur le projet de production le 22 novembre 2026. Rejouable.
alter table public.openworld_documents drop constraint if exists openworld_documents_document_key_check;
alter table public.openworld_documents add constraint openworld_documents_document_key_check check (document_key in ('draft', 'saved', 'library'));
