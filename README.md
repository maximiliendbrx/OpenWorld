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

1. Choisir Route, Gravel ou VTT et nommer le parcours.
2. Cliquer sur la carte pour placer le départ, puis les étapes et l’arrivée.
3. Cliquer directement sur la ligne verte pour créer un checkpoint entre les deux points correspondants, puis le glisser afin de forcer le parcours à emprunter la route ou le chemin souhaité. Utiliser × dans la liste (ou le popup sur la carte) pour le supprimer. Le bouton + d’un point permet aussi d’insérer le prochain point cliqué après celui-ci.
4. Utiliser la flèche d’annulation pour restaurer la modification précédente. Le bouton de cadrage affiche tous les points ; la cible demande la géolocalisation.
5. Ajouter une étape avec le bouton au-dessus de la carte. L’arrivée devient le départ partagé de l’étape suivante. Utiliser les onglets pour modifier une étape ou afficher toutes les étapes et le total.
6. Le bouton Street View en bas à droite permet de cliquer sur la carte et d’ouvrir une vue intégrée. Le repère indique la position et la direction de la caméra ; la disponibilité des images dépend de Google. Une clé Google Maps configurée est nécessaire (voir ci-dessous).
7. Télécharger le GPX une fois le calcul terminé : il contient le parcours entier dans la vue générale ou l’étape sélectionnée.

La carte démarre à Annecy mais fonctionne partout où le moteur dispose de données. Limite volontaire de 50 points. Les changements sont regroupés pendant 400 ms et les requêtes obsolètes sont annulées. Un délai de 20 secondes permet de sortir d’un calcul bloqué. Un échec n’est jamais remplacé par une ligne droite ; distance et export sont invalidés dès une modification.

## Configurer le calcul d’itinéraire

Les variables Vite sont injectées **au moment du build** : reconstruire après toute modification.

| Variable | Valeur par défaut |
| --- | --- |
| `VITE_ROUTING_URL` | `https://brouter.de/brouter` |

Le serveur BRouter doit fournir les profils `fastbike` (route), `gravel` et `mtb`, autoriser CORS et HTTPS en production. Le profil route privilégie les surfaces adaptées à un vélo rapide ; les profils gravel et VTT acceptent davantage de chemins. Les profils tiennent compte des données OpenStreetMap, mais ne garantissent ni un revêtement entièrement bitumé ni la praticabilité réelle. Le profil route ne garantit pas non plus de suivre les axes principaux.

Le serveur public BRouter est un service tiers sans garantie de disponibilité. Pour un usage soutenu, utiliser son propre serveur compatible avec les profils appropriés. Aucune clé n’est nécessaire par défaut. Ne jamais mettre de secret dans une variable `VITE_*` : elle est publique dans le navigateur. Un fournisseur exigeant une clé privée nécessite un proxy serveur.

La distance est celle renvoyée par le moteur, affichée en kilomètres. Le calcul optimise le coût propre au profil choisi, pas uniquement la distance. Le dénivelé positif additionne les montées filtrées fournies par BRouter pour chaque portion. Si cette donnée manque, l’application estime les montées à partir des altitudes Open-Meteo, échantillonnées environ tous les 30 m sur le tracé (jusqu’à 1 000 points) ; les coordonnées échantillonnées sont envoyées à ce service. Le résultat dépend de la résolution du terrain et de l’espacement des points. Si l’altitude est indisponible, la distance et l’export restent utilisables. Les itinéraires suivent le réseau OpenStreetMap selon le profil choisi ; l’accès réel, les fermetures et l’état des chemins restent à vérifier sur place. Les points peuvent être rapprochés du réseau par le moteur. L’application ne fournit ni navigation ni fonctionnement hors ligne.

## Activer Street View intégré

1. Dans Google Cloud Console, créer ou sélectionner un projet, activer la facturation et activer **Maps JavaScript API** ainsi que **Street View Static API** si Google le demande pour votre configuration.
2. Dans **API et services → Identifiants**, créer une clé API. La restreindre aux sites web autorisés : `https://maximiliendbrx.github.io/*` (et `http://localhost:5173/*` pour le développement si souhaité), ainsi qu’à Maps JavaScript API. Consulter les tarifs Google avant activation.
3. Sur GitHub, dans **Settings → Secrets and variables → Actions → Variables**, créer la variable `VITE_GOOGLE_MAPS_API_KEY` avec la clé. Elle est intégrée au code JavaScript public au build : les restrictions Google sont indispensables.
4. Relancer le workflow **Build and deploy OpenWorld** depuis l’onglet Actions, ou effectuer un nouveau push. En local, placer la variable dans `.env.local` puis relancer Vite.

## Déploiement automatique GitHub Pages

1. Copier **le contenu de ce dossier** à la racine d’un dépôt GitHub et pousser sur la branche `main` (le workflow est dans `.github/workflows/deploy.yml`).
2. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**.
3. Si nécessaire, définir la variable ci-dessus dans **Settings → Secrets and variables → Actions → Variables**. Sans valeur, le serveur public par défaut est utilisé.
4. Chaque push sur `main` lance `npm ci`, les tests, le build et le déploiement Pages. Les pull requests exécutent les tests et le build sans publier. Le workflow peut aussi être lancé manuellement.

`base: './'` permet d’héberger sous un sous-chemin de dépôt ou à la racine d’un domaine. L’URL de publication est affichée par GitHub dans le job de déploiement. Le dépôt et GitHub Pages doivent être activés par son propriétaire ; aucun déploiement n’est effectué par la simple génération de ces fichiers.

Pour Netlify, Vercel ou Cloudflare Pages : commande de build `npm run build`, répertoire publié `dist`, installation `npm ci`, Node 22 ; renseigner les variables d’environnement au build. Aucun routage SPA spécial n’est requis (application sur une page).

## Confidentialité et dépendances réseau

Les parcours restent uniquement en mémoire : recharger ou fermer la page les efface. Le fournisseur de routage reçoit les coordonnées et OpenStreetMap reçoit les requêtes de tuiles. Les polices Google sont chargées si disponibles, sinon les polices système sont utilisées. La géolocalisation est demandée à l’ouverture pour centrer la carte, et la cible permet de la recentrer ; elle nécessite HTTPS ou localhost et l’autorisation du navigateur. Le départ est choisi sur la carte. Respecter les politiques des fournisseurs de tuiles et de routage ; pas de préchargement massif des tuiles.

## Organisation

- `src/App.tsx` : éditeur, état des points et carte.
- `src/routing.ts` : adaptateur BRouter et sérialisation GPX 1.1.
- `src/style.css` : interface responsive.
- `src/routing.test.ts` : tests des erreurs, coordonnées et export.
- `.github/workflows/deploy.yml` : intégration et déploiement continus.
