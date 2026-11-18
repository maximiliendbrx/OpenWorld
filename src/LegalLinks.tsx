export default function LegalLinks() {
  const link = (hash: string, label: string) => <a href={`./legal.html#${hash}`} target="_blank" rel="noreferrer">{label}</a>;
  return <nav className="legal-links" aria-label="Informations légales">{link('mentions', 'Mentions légales')}<span aria-hidden="true">·</span>{link('cgu', 'Conditions')}<span aria-hidden="true">·</span>{link('confidentialite', 'Confidentialité')}<span aria-hidden="true">·</span>{link('cookies', 'Cookies')}</nav>;
}
