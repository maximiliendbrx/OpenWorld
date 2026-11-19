# HorizonsGPX

Application personnelle de création de parcours sportifs, en français. React 19, TypeScript, Vite et Leaflet. Connexion personnelle et synchronisation des parcours avec Supabase.

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

1. Cliquer sur **Nouveau tracé**, nommer le parcours, sélectionner une adresse ou la position actuelle, puis choisir Route, Gravel ou VTT. Le profil choisi reste fixe pour ce tracé.
   L’option **Éviter les routes rapides** s’applique aux portions ajoutées ou modifiées après son activation ; les autres portions conservent leur tracé. Elle privilégie les alternatives avec moins de voies OSM `motorway`, `trunk`, `primary`, `secondary` et leurs bretelles, y compris beaucoup de routes A britanniques, ainsi que les voies dont la vitesse indiquée est d’au moins 80 km/h (50 mph). Elle indique la longueur détectée lorsque toutes les portions ont été analysées ; sinon, le total est inconnu. Les catégories ne décrivent pas toujours la vitesse réelle ou la présence d’une piste cyclable, et le moteur peut devoir en emprunter ; le filtre ne garantit pas la sécurité. Les traces GPX importées ne sont pas analysées avant recalcul.
2. Cliquer sur la carte pour placer le départ, puis les étapes et l’arrivée.
3. Cliquer directement sur la ligne verte pour créer un checkpoint entre les deux points correspondants, puis le glisser afin de forcer le parcours à emprunter la route ou le chemin souhaité. Utiliser × dans la liste (ou le popup sur la carte) pour le supprimer. Le bouton + d’un point permet aussi d’insérer le prochain point cliqué après celui-ci.
4. Les flèches au-dessus de la carte annulent et rétablissent les modifications. Le bouton **Fermer la boucle** ajoute un retour du dernier point au départ. Le moteur compare les durées de retour parmi les alternatives disponibles pour le profil vélo choisi, sans garantie de trouver le trajet le plus rapide absolu. Le bouton de cadrage affiche tous les points ; la cible demande la géolocalisation.
5. Ajouter une étape avec le bouton au-dessus de la carte. Son départ commence à l’arrivée précédente ; si vous le faites glisser depuis l’onglet de la nouvelle étape, l’arrivée précédente reste en place. Vous pouvez aussi déplacer l’arrivée sans déplacer le départ suivant. Aucune distance fictive n’est ajoutée entre des étapes séparées. Utiliser les onglets pour modifier une étape ou afficher toutes les étapes et le total.
6. Le bouton Street View en bas à droite permet de cliquer sur la carte et d’ouvrir la vue correspondante dans un nouvel onglet Google Maps. La disponibilité des images dépend de Google ; aucune clé API n’est nécessaire.
7. Télécharger le GPX une fois le calcul terminé : il contient le parcours entier dans la vue générale ou l’étape sélectionnée.

Le bouton **Importer un GPX** charge une trace (`trkpt`) ou un itinéraire (`rtept`), jusqu’à 10 Mo, 100 000 points et 25 segments ou étapes. Plusieurs segments sont importés en étapes indépendantes. La géométrie complète et les altitudes présentes sont conservées à l’ouverture et à l’export. Des points de contrôle sont choisis automatiquement pour rendre la trace modifiable. Lorsqu’un point est modifié, seules les portions concernées sont recalculées selon le profil vélo ; elles peuvent donc différer du GPX initial. Le nom est modifiable avant l’export. Les données autres que la géométrie et l’altitude (horodatages, fréquence cardiaque et autres extensions) ne sont pas conservées.

## Sauvegardes et brouillon

Le parcours en cours est enregistré automatiquement dans un **unique brouillon** et restauré au prochain chargement. Chaque modification remplace ce brouillon. Effacer le parcours efface le brouillon ; ouvrir ou importer un autre parcours le remplace après confirmation. Le bouton **Enregistrer** crée une sauvegarde nommée, puis met à jour cette même sauvegarde lors des enregistrements suivants. **Mes parcours** permet de les rouvrir, de les supprimer ou d’enregistrer une copie séparée.

Les données sont enregistrées sur cet appareil puis synchronisées avec votre compte Supabase. L’état de synchronisation apparaît dans l’interface ; en cas de coupure, les modifications restent sur cet appareil et sont envoyées après reconnexion. Si deux appareils modifient les mêmes données, choisissez la version à conserver après avoir téléchargé une copie locale si nécessaire. Le stockage du navigateur est limité : un message signale un échec d’écriture. Exportez régulièrement vos données pour garder une copie indépendante. À la première connexion, les anciennes données locales peuvent être copiées dans le compte ; elles restent également sur l’appareil.

Dans **Mes parcours**, « Télécharger mes sauvegardes » crée un fichier JSON contenant le brouillon et tous les parcours enregistrés, leurs étapes et leurs réglages. « Restaurer une sauvegarde » permet de les transférer dans un autre navigateur ou sur une nouvelle adresse : les parcours existants sont conservés, sauf ceux de même identifiant qui sont remplacés après confirmation. Le fichier contient vos données personnelles et doit être conservé en lieu sûr.

La carte démarre à Annecy mais fonctionne partout où le moteur dispose de données. Limite volontaire de 50 points. Les changements sont regroupés pendant 400 ms et les requêtes obsolètes sont annulées. Le calcul dispose d’au moins 10 minutes, avec davantage de temps pour les parcours à nombreuses portions, avant de signaler un blocage. Le service tiers conserve ses propres limites : si une portion échoue, ajouter un point intermédiaire ou réessayer. Un échec n’est jamais remplacé par une ligne droite ; distance et export sont invalidés dès une modification.

## Configurer Supabase

1. Créer un projet Supabase, puis créer un unique utilisateur dans **Authentication → Users** et désactiver les inscriptions publiques dans les réglages d’authentification.
2. Exécuter le contenu de [`supabase/setup.sql`](supabase/setup.sql) dans le SQL Editor. Le script exige exactement un utilisateur et autorise uniquement ce compte à accéder aux documents ; il active les règles RLS. Réexécutez-le après avoir remplacé l’utilisateur autorisé.
3. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` au build si vous utilisez un autre projet que celui configuré par défaut. L’URL et la clé publishable sont publiques ; ne jamais utiliser la clé secrète ou `service_role` dans l’application.
4. Connectez-vous avec l’adresse e-mail et le mot de passe du compte créé. Aucun mot de passe n’est stocké dans le dépôt.

Le site et son code restent publics sur GitHub Pages ; les parcours du compte sont protégés par les règles RLS côté Supabase. Les fichiers GPX ou JSON exportés doivent être conservés en lieu sûr.

## Configurer le calcul d’itinéraire

Les variables Vite sont injectées **au moment du build** : reconstruire après toute modification.

| Variable | Valeur par défaut |
| --- | --- |
| `VITE_ROUTING_URL` | `https://brouter.de/brouter` |

Le serveur BRouter doit fournir les profils `fastbike` (route), `fastbike-verylowtraffic` (route avec filtre), `gravel` et `mtb`, autoriser CORS et HTTPS en production, et renvoyer les catégories et distances dans `properties.messages`. Le filtre compare jusqu’à trois alternatives par portion et choisit celle avec le moins de grands axes, puis la plus rapide à égalité ; si les catégories sont absentes, le calcul signale l’erreur. Si le serveur interrompt un long calcul avec le filtre, une trace de référence sert à le découper automatiquement en portions plus courtes, qui sont toutes recalculées avec le filtre. Le profil route privilégie les surfaces adaptées à un vélo rapide ; les profils gravel et VTT acceptent davantage de chemins. Les profils tiennent compte des données OpenStreetMap, mais ne garantissent ni un revêtement entièrement bitumé ni la praticabilité réelle. Le profil route ne garantit pas non plus de suivre les axes principaux.

Le serveur public BRouter est un service tiers sans garantie de disponibilité. Pour un usage soutenu, utiliser son propre serveur compatible avec les profils appropriés. Aucune clé n’est nécessaire par défaut. Ne jamais mettre de secret dans une variable `VITE_*` : elle est publique dans le navigateur. Un fournisseur exigeant une clé privée nécessite un proxy serveur.

La distance est celle renvoyée par le moteur, affichée en kilomètres. Le calcul optimise le coût propre au profil choisi, pas uniquement la distance. Le dénivelé positif additionne les montées filtrées fournies par BRouter pour chaque portion. Si cette donnée manque, l’application estime les montées à partir des altitudes Open-Meteo, échantillonnées environ tous les 30 m sur le tracé (jusqu’à 1 000 points) ; les coordonnées échantillonnées sont envoyées à ce service. Le résultat dépend de la résolution du terrain et de l’espacement des points. Si l’altitude est indisponible, la distance et l’export restent utilisables. Les itinéraires suivent le réseau OpenStreetMap selon le profil choisi ; l’accès réel, les fermetures et l’état des chemins restent à vérifier sur place. Les points peuvent être rapprochés du réseau par le moteur. L’application ne fournit ni navigation ni fonctionnement hors ligne.

## Déploiement automatique GitHub Pages

1. Copier **le contenu de ce dossier** à la racine d’un dépôt GitHub et pousser sur la branche `main` (le workflow est dans `.github/workflows/deploy.yml`).
2. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**.
3. Si nécessaire, définir les variables `VITE_ROUTING_URL`, `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans **Settings → Secrets and variables → Actions → Variables**. Sans valeur, le serveur public par défaut est utilisé.
4. Chaque push sur `main` lance `npm ci`, les tests, le build et le déploiement Pages. Les pull requests exécutent les tests et le build sans publier. Le workflow peut aussi être lancé manuellement.

`base: './'` permet d’héberger sous un sous-chemin de dépôt ou à la racine d’un domaine. L’URL de publication est affichée par GitHub dans le job de déploiement. Le dépôt et GitHub Pages doivent être activés par son propriétaire.

Pour Netlify, Vercel ou Cloudflare Pages : commande de build `npm run build`, répertoire publié `dist`, installation `npm ci`, Node 22 ; renseigner les variables d’environnement au build. Aucun routage SPA spécial n’est requis (application sur une page).

## Confidentialité et dépendances réseau

Le brouillon et les sauvegardes sont stockés dans Supabase et mis en cache dans le navigateur. Le fournisseur de routage reçoit les coordonnées, OpenStreetMap reçoit les requêtes de tuiles et Nominatim reçoit les adresses recherchées pour le départ. Les polices Google sont chargées si disponibles, sinon les polices système sont utilisées. La géolocalisation est demandée à l’ouverture pour centrer la carte, et la cible permet de la recentrer ; elle nécessite HTTPS ou localhost et l’autorisation du navigateur. Le départ est choisi sur la carte. Respecter les politiques des fournisseurs de tuiles et de routage ; pas de préchargement massif des tuiles.

## Organisation

- `src/App.tsx` : éditeur, état des points et carte.
- `src/routing.ts` : adaptateur BRouter et sérialisation GPX 1.1.
- `src/style.css` : interface responsive.
- `src/routing.test.ts` : tests des erreurs, coordonnées et export.
- `.github/workflows/deploy.yml` : intégration et déploiement continus.
