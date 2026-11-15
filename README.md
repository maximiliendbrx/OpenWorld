# OpenWorld

Application personnelle de création de parcours sportifs, en français. React 19, TypeScript, Vite et Leaflet. Aucune connexion, aucun backend ni base de données.

## Démarrage

Node.js 22 LTS et npm sont recommandés.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Ouvrir l’adresse affichée par Vite (habituellement http://localhost:5173).

```bash
npm test       # tests du routage et du GPX
npm run build # vérification TypeScript puis build de production
npm run preview # prévisualisation du build
```

Le résultat de production est dans `dist/`.

## Utilisation

1. Choisir À pied ou À vélo et nommer le parcours.
2. Cliquer sur la carte pour placer le départ, puis les étapes et l’arrivée.
3. Cliquer directement sur la ligne verte pour créer un checkpoint entre les deux points correspondants, puis le glisser afin de forcer le parcours à emprunter la route ou le chemin souhaité. Utiliser × dans la liste (ou le popup sur la carte) pour le supprimer. Le bouton + d’un point permet aussi d’insérer le prochain point cliqué après celui-ci.
4. Utiliser la flèche d’annulation pour restaurer la modification précédente. Le bouton de cadrage affiche tous les points ; la cible demande la géolocalisation.
5. Télécharger le GPX une fois le calcul terminé. Il contient toute la géométrie routée, pas seulement les points de passage.

La carte démarre à Annecy mais fonctionne partout où le moteur dispose de données. Limite volontaire de 50 points. Les changements sont regroupés pendant 400 ms et les requêtes obsolètes sont annulées. Un délai de 20 secondes permet de sortir d’un calcul bloqué. Un échec n’est jamais remplacé par une ligne droite ; distance et export sont invalidés dès une modification.

## Configurer le calcul d’itinéraire

Les variables Vite sont injectées **au moment du build** : reconstruire après toute modification.

| Variable | Valeur par défaut |
| --- | --- |
| `VITE_ROUTING_FOOT_URL` | `https://routing.openstreetmap.de/routed-foot/route/v1/driving` |
| `VITE_ROUTING_BIKE_URL` | `https://routing.openstreetmap.de/routed-bike/route/v1/driving` |

Ces serveurs OSRM publics proposent des profils distincts à pied et à vélo. Dans OSRM, le profil est configuré côté serveur : changer le mot `driving` dans l’URL ne transforme pas un serveur automobile en serveur piéton. Fournir un endpoint complet jusqu’au profil, sans coordonnées. Le serveur doit autoriser CORS et HTTPS en production. Pour un autre fournisseur (Valhalla, GraphHopper, etc.), remplacer l’adaptateur `calculateRoute` dans `src/routing.ts` en conservant son contrat `Route` et son support d’AbortSignal.

Les serveurs de démonstration sont des services tiers sans garantie de disponibilité. Pour un usage soutenu, utiliser un fournisseur adapté ou son propre OSRM avec les profils appropriés. Aucune clé n’est nécessaire par défaut. Ne jamais mettre de secret dans une variable `VITE_*` : elle est publique dans le navigateur. Un fournisseur exigeant une clé privée nécessite un proxy serveur.

La distance est celle renvoyée par le moteur, affichée en kilomètres. Les itinéraires suivent le réseau OpenStreetMap selon le profil choisi ; l’accès réel, les fermetures et l’état des chemins restent à vérifier sur place. Les points peuvent être rapprochés du réseau par le moteur. La version initiale ne fournit pas d’altitude, de navigation ni de fonctionnement hors ligne.

## Déploiement automatique GitHub Pages

1. Copier **le contenu de ce dossier** à la racine d’un dépôt GitHub et pousser sur la branche `main` (le workflow est dans `.github/workflows/deploy.yml`).
2. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**.
3. Si nécessaire, définir les deux variables ci-dessus dans **Settings → Secrets and variables → Actions → Variables**. Sans valeur, les endpoints par défaut sont utilisés.
4. Chaque push sur `main` lance `npm ci`, les tests, le build et le déploiement Pages. Les pull requests exécutent les tests et le build sans publier. Le workflow peut aussi être lancé manuellement.

`base: './'` permet d’héberger sous un sous-chemin de dépôt ou à la racine d’un domaine. L’URL de publication est affichée par GitHub dans le job de déploiement. Le dépôt et GitHub Pages doivent être activés par son propriétaire ; aucun déploiement n’est effectué par la simple génération de ces fichiers.

Pour Netlify, Vercel ou Cloudflare Pages : commande de build `npm run build`, répertoire publié `dist`, installation `npm ci`, Node 22 ; renseigner les variables d’environnement au build. Aucun routage SPA spécial n’est requis (application sur une page).

## Confidentialité et dépendances réseau

Les parcours restent uniquement en mémoire : recharger ou fermer la page les efface. Le fournisseur de routage reçoit les coordonnées et OpenStreetMap reçoit les requêtes de tuiles. Les polices Google sont chargées si disponibles, sinon les polices système sont utilisées. La géolocalisation est demandée à l’ouverture pour centrer la carte, et la cible permet de la recentrer ; elle nécessite HTTPS ou localhost et l’autorisation du navigateur. Le départ est choisi sur la carte. Respecter les politiques des fournisseurs de tuiles et de routage ; pas de préchargement massif des tuiles.

## Organisation

- `src/App.tsx` : éditeur, état des points et carte.
- `src/routing.ts` : adaptateur OSRM et sérialisation GPX 1.1.
- `src/style.css` : interface responsive.
- `src/routing.test.ts` : tests des erreurs, coordonnées et export.
- `.github/workflows/deploy.yml` : intégration et déploiement continus.
