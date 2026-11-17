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
   L’option **Éviter les routes rapides** privilégie les alternatives avec moins de voies OSM `motorway`, `trunk`, `primary`, `secondary` et leurs bretelles, y compris beaucoup de routes A britanniques, ainsi que les voies dont la vitesse indiquée est d’au moins 80 km/h (50 mph). Elle indique la longueur détectée. Les catégories ne décrivent pas toujours la vitesse réelle ou la présence d’une piste cyclable, et le moteur peut devoir en emprunter ; le filtre ne garantit pas la sécurité. Les traces GPX importées ne sont pas analysées avant recalcul.
2. Cliquer sur la carte pour placer le départ, puis les étapes et l’arrivée.
3. Cliquer directement sur la ligne verte pour créer un checkpoint entre les deux points correspondants, puis le glisser afin de forcer le parcours à emprunter la route ou le chemin souhaité. Utiliser × dans la liste (ou le popup sur la carte) pour le supprimer. Le bouton + d’un point permet aussi d’insérer le prochain point cliqué après celui-ci.
4. Les flèches au-dessus de la carte annulent et rétablissent les modifications. Le bouton **Fermer la boucle** ajoute un retour du dernier point au départ. Le moteur compare les durées de retour parmi les alternatives disponibles pour le profil vélo choisi, sans garantie de trouver le trajet le plus rapide absolu. Le bouton de cadrage affiche tous les points ; la cible demande la géolocalisation.
5. Ajouter une étape avec le bouton au-dessus de la carte. Son départ commence à l’arrivée précédente ; si vous le faites glisser depuis l’onglet de la nouvelle étape, l’arrivée précédente reste en place. Vous pouvez aussi déplacer l’arrivée sans déplacer le départ suivant. Aucune distance fictive n’est ajoutée entre des étapes séparées. Utiliser les onglets pour modifier une étape ou afficher toutes les étapes et le total.
6. Le bouton Street View en bas à droite permet de cliquer sur la carte et d’ouvrir la vue correspondante dans un nouvel onglet Google Maps. La disponibilité des images dépend de Google ; aucune clé API n’est nécessaire.
7. Télécharger le GPX une fois le calcul terminé : il contient le parcours entier dans la vue générale ou l’étape sélectionnée.

Le bouton **Importer un GPX** charge une trace (`trkpt`) ou un itinéraire (`rtept`), jusqu’à 10 Mo, 100 000 points et 25 segments ou étapes. Plusieurs segments sont importés en étapes indépendantes. La géométrie complète et les altitudes présentes sont conservées à l’ouverture et à l’export. Des points de contrôle sont choisis automatiquement pour rendre la trace modifiable. Lorsqu’un point est modifié, seules les portions concernées sont recalculées selon le profil vélo ; elles peuvent donc différer du GPX initial. Le nom est modifiable avant l’export. Les données autres que la géométrie et l’altitude (horodatages, fréquence cardiaque et autres extensions) ne sont pas conservées.

## Sauvegardes et brouillon

Le parcours en cours est enregistré automatiquement dans un **unique brouillon** et restauré au prochain chargement. Chaque modification remplace ce brouillon. Effacer le parcours efface le brouillon ; ouvrir ou importer un autre parcours le remplace après confirmation. Le bouton **Enregistrer** crée une sauvegarde nommée, puis met à jour cette même sauvegarde lors des enregistrements suivants. **Mes parcours** permet de les rouvrir, de les supprimer ou d’enregistrer une copie séparée.

Les données sont conservées localement dans le stockage du navigateur, sans compte ni serveur. Elles ne sont pas synchronisées entre appareils ou navigateurs et peuvent disparaître si les données du navigateur sont effacées ou en navigation privée. Le stockage est limité : un message signale si un brouillon ou une sauvegarde ne peut pas être écrit. Exporter en GPX pour conserver une copie indépendante.

Dans **Mes parcours**, « Télécharger mes sauvegardes » crée un fichier JSON contenant le brouillon et tous les parcours enregistrés, leurs étapes et leurs réglages. « Restaurer une sauvegarde » permet de les transférer dans un autre navigateur ou sur une nouvelle adresse : les parcours existants sont conservés, sauf ceux de même identifiant qui sont remplacés après confirmation. Le fichier contient vos données personnelles et doit être conservé en lieu sûr.

La carte démarre à Annecy mais fonctionne partout où le moteur dispose de données. Limite volontaire de 50 points. Les changements sont regroupés pendant 400 ms et les requêtes obsolètes sont annulées. Un délai de 20 secondes permet de sortir d’un calcul bloqué. Un échec n’est jamais remplacé par une ligne droite ; distance et export sont invalidés dès une modification.

## Configurer le calcul d’itinéraire

Les variables Vite sont injectées **au moment du build** : reconstruire après toute modification.

| Variable | Valeur par défaut |
| --- | --- |
| `VITE_ROUTING_URL` | `https://brouter.de/brouter` |

Le serveur BRouter doit fournir les profils `fastbike` (route), `fastbike-verylowtraffic` (route avec filtre), `gravel` et `mtb`, autoriser CORS et HTTPS en production, et renvoyer les catégories et distances dans `properties.messages`. Le filtre compare jusqu’à trois alternatives par portion et choisit celle avec le moins de grands axes, puis la plus rapide à égalité ; si les catégories sont absentes, le calcul signale l’erreur. Le profil route privilégie les surfaces adaptées à un vélo rapide ; les profils gravel et VTT acceptent davantage de chemins. Les profils tiennent compte des données OpenStreetMap, mais ne garantissent ni un revêtement entièrement bitumé ni la praticabilité réelle. Le profil route ne garantit pas non plus de suivre les axes principaux.

Le serveur public BRouter est un service tiers sans garantie de disponibilité. Pour un usage soutenu, utiliser son propre serveur compatible avec les profils appropriés. Aucune clé n’est nécessaire par défaut. Ne jamais mettre de secret dans une variable `VITE_*` : elle est publique dans le navigateur. Un fournisseur exigeant une clé privée nécessite un proxy serveur.

La distance est celle renvoyée par le moteur, affichée en kilomètres. Le calcul optimise le coût propre au profil choisi, pas uniquement la distance. Le dénivelé positif additionne les montées filtrées fournies par BRouter pour chaque portion. Si cette donnée manque, l’application estime les montées à partir des altitudes Open-Meteo, échantillonnées environ tous les 30 m sur le tracé (jusqu’à 1 000 points) ; les coordonnées échantillonnées sont envoyées à ce service. Le résultat dépend de la résolution du terrain et de l’espacement des points. Si l’altitude est indisponible, la distance et l’export restent utilisables. Les itinéraires suivent le réseau OpenStreetMap selon le profil choisi ; l’accès réel, les fermetures et l’état des chemins restent à vérifier sur place. Les points peuvent être rapprochés du réseau par le moteur. L’application ne fournit ni navigation ni fonctionnement hors ligne.

## Connexion privée et déploiement

La protection nécessite le Worker Cloudflare fourni dans `worker/index.ts` et `wrangler.toml`. Il vérifie la session **avant de servir chaque page ou fichier** ; sans configuration il renvoie une erreur 503. `npm run dev`, `npm run preview` et GitHub Pages servent les fichiers statiques seuls et **ne fournissent pas cette protection**. Le dépôt GitHub et son code source peuvent rester publics, mais ne doivent contenir aucun identifiant ni donnée personnelle.

1. Créer un compte Cloudflare Workers et, sur votre ordinateur, installer Node.js 22, cloner le dépôt puis exécuter `npm ci` et `npx wrangler login`.
2. Construire et créer le Worker avec `npm run build` puis `npx wrangler deploy`. Le site renvoie 503 tant que les secrets ne sont pas configurés. Le fichier `wrangler.toml` impose le passage par le Worker pour tous les fichiers et définit les limites de tentatives ; ne pas désactiver `run_worker_first` ou les limites.
3. Exécuter **sur votre ordinateur**, dans un terminal privé : `node scripts/create-credentials.mjs`. Choisir un identifiant et un mot de passe unique de 16 caractères minimum ; le mot de passe est saisi sans affichage. Le script affiche trois valeurs. Dans Cloudflare Workers → `openworld-private` → Settings → Variables and Secrets, les ajouter comme secrets : `AUTH_USERNAME`, `AUTH_PASSWORD_VERIFIER` et `AUTH_SESSION_SECRET`. Ne pas les ajouter au dépôt ni les envoyer dans une conversation. Redéployer si Cloudflare le demande. Le mot de passe lui-même n’est pas stocké par l’application.
4. Ouvrir l’URL `workers.dev` fournie par Cloudflare et vérifier : la page et les fichiers `/index.html` et `/assets/...` redirigent vers `/connexion` sans session, un mauvais mot de passe est refusé, et le bon donne accès au site. Vérifier aussi la déconnexion. Des limites approximatives par adresse IP et par centre Cloudflare ralentissent les tentatives répétées ; elles ne remplacent pas un mot de passe fort.
5. Pour déployer automatiquement depuis GitHub, créer un jeton Cloudflare avec le modèle **Edit Cloudflare Workers**, puis ajouter les secrets GitHub Actions `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` dans les paramètres du dépôt. Le workflow `.github/workflows/deploy-private.yml` teste, construit et déploie le Worker sur chaque push vers `main`. Les secrets d’identification du site restent dans Cloudflare, séparés des secrets GitHub.
6. **Migration depuis GitHub Pages :** avant de désactiver l’ancien site, exporter chaque parcours enregistré et le brouillon en GPX, puis les réimporter sur la nouvelle adresse. Le stockage du navigateur est propre à chaque adresse : il ne migre pas automatiquement. Après vérification de la nouvelle connexion et récupération des parcours, désactiver GitHub Pages dans les paramètres du dépôt. Tant que l’ancien site existe à son ancienne URL, il reste public et n’est pas protégé par le Worker. Les anciens liens ne peuvent pas être protégés automatiquement par cette nouvelle adresse.

Chaque personne utilisant les mêmes identifiants accède à l’application, mais les brouillons et sauvegardes restent dans le navigateur de chaque appareil ; cette version ne synchronise pas les parcours entre appareils. Une session expire après 12 heures ; le bouton **Se déconnecter** la ferme sur l’appareil utilisé. Changer l’identifiant, le vérificateur du mot de passe ou le secret de session invalide les sessions existantes. Pour changer le mot de passe, relancer le script puis mettre à jour les trois secrets Cloudflare.

## Confidentialité et dépendances réseau

Le brouillon et les sauvegardes restent dans le stockage local du navigateur. Le fournisseur de routage reçoit les coordonnées et OpenStreetMap reçoit les requêtes de tuiles. Les polices Google sont chargées si disponibles, sinon les polices système sont utilisées. La géolocalisation est demandée à l’ouverture pour centrer la carte, et la cible permet de la recentrer ; elle nécessite HTTPS ou localhost et l’autorisation du navigateur. Le départ est choisi sur la carte. Respecter les politiques des fournisseurs de tuiles et de routage ; pas de préchargement massif des tuiles.

## Organisation

- `src/App.tsx` : éditeur, état des points et carte.
- `src/routing.ts` : adaptateur BRouter et sérialisation GPX 1.1.
- `src/style.css` : interface responsive.
- `src/routing.test.ts` : tests des erreurs, coordonnées et export.
- `.github/workflows/deploy.yml` : intégration et déploiement continus.
