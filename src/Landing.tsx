import { Route, Mountain, Trees, Download, Flag, Layers, Cloud, TrendingUp, MapPin, Check, Globe, Smartphone, Gauge, ArrowRight, Plus } from 'lucide-react';
import LegalLinks from './LegalLinks';

const features = [
  { Icon: MapPin, title: 'Tracez en cliquant', text: 'Posez un point de départ, puis ajoutez vos étapes sur la carte. Le parcours se calcule tout seul, sur les routes ou sur les chemins selon votre type de vélo.' },
  { Icon: Gauge, title: 'Même les très longs parcours', text: 'Un 2 points Paris–Rome ou une course de plus de 1 000 km avec des centaines de checkpoints : le calcul est conçu pour tenir, sans erreur.' },
  { Icon: TrendingUp, title: 'Profil de dénivelé', text: 'Une courbe sous la carte, un point qui suit votre souris sur le tracé, et la possibilité de sélectionner une portion pour connaître ses kilomètres et son dénivelé positif.' },
  { Icon: Layers, title: 'Étapes et multi-jours', text: 'Découpez votre aventure en étapes, visualisez chacune d’elles et exportez-les séparément ou d’un seul bloc.' },
  { Icon: Flag, title: 'Points obligatoires (KMZ)', text: 'Pour les courses ultra-distance : importez les checkpoints imposés, voyez-les sur la carte et vérifiez que votre tracé passe bien par chacun.' },
  { Icon: Download, title: 'Export GPX', text: 'Emportez votre trace sur votre compteur GPS ou votre application sportive. Vous pouvez aussi importer un GPX existant pour le retravailler.' },
  { Icon: Globe, title: 'Cartes lisibles partout', text: 'Les noms de lieux s’affichent en caractères latins, même au bout du monde. Vous pouvez aussi basculer sur les noms locaux.' },
  { Icon: Cloud, title: 'Vos parcours vous suivent', text: 'Votre compte conserve vos tracés : retrouvez-les sur votre ordinateur, votre tablette ou votre téléphone, avec une sauvegarde téléchargeable.' },
];
const steps = [
  { n: '01', title: 'Tracez', text: 'Choisissez route, gravel ou VTT, puis cliquez sur la carte pour placer le départ, les étapes et l’arrivée.' },
  { n: '02', title: 'Ajustez', text: 'Cliquez sur la ligne pour ajouter un checkpoint et faites-le glisser pour imposer le chemin que vous voulez.' },
  { n: '03', title: 'Partez', text: 'Exportez le fichier GPX et ouvrez-le dans votre GPS ou votre application. Moins d’écran, plus de grand air.' },
];
const faq = [
  { q: 'Est-ce vraiment gratuit ?', a: 'Oui. La création, le calcul et l’export de vos tracés sont gratuits. Le plan gratuit permet d’enregistrer 3 parcours dans votre compte ; une offre Pro pour en enregistrer sans limite arrive prochainement.' },
  { q: 'Avec quels appareils puis-je utiliser mes tracés ?', a: 'L’export GPX est un format universel, lu par la plupart des compteurs GPS et applications de vélo et de randonnée.' },
  { q: 'D’où viennent les cartes et les itinéraires ?', a: 'Des données OpenStreetMap. Elles sont très riches mais pas parfaites : vérifiez toujours l’accès et les conditions sur le terrain avant de partir.' },
  { q: 'Puis-je l’utiliser sur mon téléphone ?', a: 'Oui, le site s’adapte aux petits écrans, avec un mode d’édition plein écran. L’ordinateur reste le plus confortable pour préparer de longs parcours.' },
  { q: 'Que deviennent mes données ?', a: 'Vos parcours sont rattachés à votre compte et ne sont visibles que par vous. Vous pouvez supprimer votre compte et toutes vos données à tout moment.' },
];

function Hero() {
  return <svg className="ld-art" viewBox="0 0 520 380" role="img" aria-label="Illustration d’un itinéraire en montagne avec son profil de dénivelé">
    <defs><linearGradient id="ldsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7efdf"/><stop offset="1" stopColor="#f6f8f0"/></linearGradient></defs>
    <rect width="520" height="380" rx="22" fill="url(#ldsky)"/>
    <g fill="none" stroke="#cfdcc7" strokeWidth="1.4">{[0, 1, 2, 3, 4, 5].map(i => <ellipse key={i} cx="150" cy="130" rx={34 + i * 24} ry={20 + i * 15} transform="rotate(-14 150 130)"/>)}{[0, 1, 2, 3, 4].map(i => <ellipse key={`b${i}`} cx="400" cy="210" rx={28 + i * 26} ry={18 + i * 15} transform="rotate(10 400 210)"/>)}</g>
    <path d="M58 262 C118 226 150 252 206 206 S300 118 352 150 S430 112 462 70" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round"/>
    <path d="M58 262 C118 226 150 252 206 206 S300 118 352 150 S430 112 462 70" fill="none" stroke="#e673ac" strokeWidth="5.5" strokeLinecap="round"/>
    {[[58, 262, 1], [206, 206, 2], [352, 150, 3], [462, 70, 4]].map(([x, y, n]) => <g key={n}><circle cx={x} cy={y} r="14" fill="#00520a" stroke="#fff" strokeWidth="3"/><text x={x} y={Number(y) + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="DM Sans, sans-serif">{n}</text></g>)}
    <g transform="translate(24 296)"><rect width="472" height="64" rx="12" fill="#fff" stroke="#dfe8db"/><path d="M16 48 L70 40 L110 46 L160 26 L205 36 L250 18 L300 30 L350 14 L400 28 L456 20" fill="none" stroke="#00520a" strokeWidth="2.4" strokeLinejoin="round"/><path d="M16 48 L70 40 L110 46 L160 26 L205 36 L250 18 L300 30 L350 14 L400 28 L456 20 L456 58 L16 58 Z" fill="#00520a" opacity=".09"/></g>
    <g transform="translate(24 24)"><rect width="214" height="62" rx="12" fill="#fff" stroke="#dfe8db"/><text x="16" y="26" fontSize="11" fill="#7c8b7a" fontFamily="DM Sans, sans-serif">Distance totale</text><text x="16" y="50" fontSize="22" fontWeight="700" fill="#00520a" fontFamily="Manrope, sans-serif">124,8 km</text><text x="124" y="26" fontSize="11" fill="#7c8b7a" fontFamily="DM Sans, sans-serif">Dénivelé +</text><text x="124" y="50" fontSize="22" fontWeight="700" fill="#00520a" fontFamily="Manrope, sans-serif">2 340 m</text></g>
  </svg>;
}

export default function Landing({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const go = (id: string) => (e: { preventDefault: () => void }) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return <div className="ld">
    <header className="ld-nav"><a className="ld-brand" href="./">△ horizonsgpx<span>.</span></a><nav aria-label="Sections"><a href="#fonctions" onClick={go('fonctions')}>Fonctionnalités</a><a href="#comment" onClick={go('comment')}>Comment ça marche</a><a href="#faq" onClick={go('faq')}>Questions</a></nav><div className="ld-nav-actions"><button className="ld-link" onClick={onSignIn}>Se connecter</button><button className="ld-btn small" onClick={onSignUp}>Créer un compte</button></div></header>
    <main>
      <section className="ld-hero"><div className="ld-hero-text"><span className="ld-eyebrow">ITINÉRAIRES VÉLO, GRAVEL ET VTT</span><h1>Dessinez votre prochaine aventure.</h1><p>Créez des parcours à vélo en quelques clics, visualisez le dénivelé et exportez le tout en GPX pour votre GPS. Du week-end près de chez vous à la course de plus de 1 000 km.</p><div className="ld-cta"><button className="ld-btn" onClick={onSignUp}>Créer mon compte gratuit <ArrowRight size={18}/></button><button className="ld-btn ghost" onClick={onSignIn}>Se connecter</button></div><ul className="ld-ticks"><li><Check size={15}/> Gratuit pour commencer</li><li><Check size={15}/> Sans carte bancaire</li><li><Check size={15}/> Export GPX</li></ul></div><Hero/></section>
      <section className="ld-bands" aria-label="Types de parcours"><div><Route size={20}/><b>Route</b><span>Asphalte et petites routes</span></div><div><Trees size={20}/><b>Gravel</b><span>Chemins roulants et pistes</span></div><div><Mountain size={20}/><b>VTT</b><span>Sentiers et single tracks</span></div></section>
      <section id="fonctions" className="ld-section"><span className="ld-eyebrow">TOUT CE QU’IL FAUT POUR PARTIR</span><h2>Un outil simple, des fonctions de pro.</h2><p className="ld-lead">Pensé pour ceux qui préparent une sortie comme pour ceux qui organisent une aventure de plusieurs jours.</p><div className="ld-grid">{features.map(({ Icon, title, text }) => <article key={title} className="ld-card"><span className="ld-ico"><Icon size={22}/></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section id="comment" className="ld-section alt"><span className="ld-eyebrow">DU PREMIER POINT AU GRAND AIR</span><h2>Votre aventure en 3 étapes.</h2><ol className="ld-steps">{steps.map(s => <li key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol></section>
      <section className="ld-section"><span className="ld-eyebrow">POUR QUI ?</span><h2>Chaque sortie mérite son tracé.</h2><div className="ld-grid three"><article className="ld-card"><h3>Les sorties du week-end</h3><p>Préparez une boucle autour de chez vous, ajustez-la pour éviter les routes rapides, et partez l’esprit tranquille.</p></article><article className="ld-card"><h3>Le bikepacking</h3><p>Découpez un voyage en étapes, repérez le dénivelé de chaque jour et exportez chaque jour séparément.</p></article><article className="ld-card"><h3>L’ultra-distance</h3><p>Importez les checkpoints obligatoires de la course, construisez votre tracé à travers eux et contrôlez que rien ne manque.</p></article></div></section>
      <section className="ld-section alt"><span className="ld-eyebrow">TARIFS</span><h2>Commencez gratuitement.</h2><div className="ld-plans"><article className="ld-plan"><h3>Gratuit</h3><strong>0 €</strong><ul><li><Check size={15}/> Création et calcul de tracés</li><li><Check size={15}/> Profil de dénivelé</li><li><Check size={15}/> Import et export GPX</li><li><Check size={15}/> 3 parcours enregistrés</li></ul><button className="ld-btn" onClick={onSignUp}>Créer mon compte</button></article><article className="ld-plan pro"><span className="ld-soon">Bientôt</span><h3>Pro</h3><strong>Parcours illimités</strong><ul><li><Check size={15}/> Tout le plan gratuit</li><li><Check size={15}/> Enregistrez autant de parcours que vous voulez</li></ul><button className="ld-btn ghost" onClick={onSignUp}>Me lancer gratuitement</button></article></div></section>
      <section id="faq" className="ld-section"><span className="ld-eyebrow">QUESTIONS FRÉQUENTES</span><h2>Vous vous demandez…</h2><div className="ld-faq">{faq.map(f => <details key={f.q}><summary>{f.q}<Plus size={18}/></summary><p>{f.a}</p></details>)}</div></section>
      <section className="ld-final"><h2>Prêt à tracer votre prochaine sortie ?</h2><p>Créez votre compte gratuit et votre premier parcours en quelques minutes.</p><button className="ld-btn light" onClick={onSignUp}>Créer mon compte gratuit <ArrowRight size={18}/></button><small><Smartphone size={14}/> Fonctionne sur ordinateur, tablette et téléphone.</small></section>
    </main>
    <footer className="ld-footer"><div className="ld-brand dark">△ horizonsgpx<span>.</span></div><p>Moins d’écran. Plus de grand air.</p><LegalLinks/><small>Cartes © les contributeurs d’OpenStreetMap.</small></footer>
  </div>;
}
