# JobTime Proof Web

Version web autonome (HTML/CSS/JS), stockée en local (LocalStorage).

## Lancer

Option simple:
- Ouvrir `index.html` directement dans le navigateur.

Option recommandée (serveur local):
```bash
cd "JobTime Proof web"
python3 -m http.server 8080
```
Puis ouvrir: `http://localhost:8080`

Option rapide Linux:
```bash
cd "JobTime Proof web"
./start_web.sh
```

## Fonctionnalités incluses

- Navigation 5 onglets: tableau de bord, session, historique, rapport, paramètres
- Session timer (start/pause/finish)
- Notes session
- URLs multiples en attente pendant session
- Bouton pour ouvrir toutes les URLs en attente d'un coup
- Ajout de preuves fichier (image/PDF) pendant session
- Sauvegarde session en local
- Historique des sessions avec aperçu des preuves:
  - image: vignette
  - PDF: lien d'ouverture
  - URL: lien cliquable
- Filtres avancés historique: plateforme, action, date début/fin, mot-clé
- Tri historique: date, durée, plateforme
- Bouton par session: ouvrir toutes les URLs de la session
- Rapport synthétique local + bouton `Générer PDF (Imprimer)`
- Rapport pro: période sélectionnable + tableau détaillé des sessions
- Paramètres: objectif hebdo, plateformes personnalisées
- Export JSON, import JSON (remplacement des données locales), reset complet
- PWA installable (desktop/mobile) avec cache offline
- IA intégrée avec choix ChatGPT / Gemini / Mistral
  - Mode lien (sans clé): ouvre l'IA et copie le prompt
  - Mode API directe: réponse affichée dans l'app

## Tester rapidement

1. Aller dans `Session`, lancer `Démarrer`, ajouter 1 URL et 1 image/PDF, puis `Terminer`.
2. Aller dans `Historique` et vérifier l'affichage de la preuve.
3. Aller dans `Rapport` puis `Générer PDF (Imprimer)` et choisir `Enregistrer en PDF`.
4. Aller dans `Paramètres` pour exporter puis réimporter le JSON.

## Installer comme application (PWA)

1. Ouvrir l'app dans Chrome/Edge.
2. Cliquer sur l'icône d'installation dans la barre d'adresse (ou menu `Installer l'application`).
3. L'application sera disponible comme app locale, même hors ligne (cache).

## Utiliser l'IA

1. Aller dans `Paramètres` > `Assistant IA`.
2. Choisir le provider (`ChatGPT`, `Gemini`, `Mistral`).
3. Choisir le mode:
   - `Sans clé (ouverture web)` pour copier-coller le prompt dans l'IA.
   - `API directe` puis coller la clé API.
4. Aller dans `Session` puis cliquer `Assistant IA (notes + URLs)`.

Note:
- En mode API directe, selon le navigateur et la politique CORS de l'API, certaines requêtes peuvent être bloquées côté navigateur. Dans ce cas, utiliser le mode lien.

## Remarques

- Cette version web est indépendante de la version Flutter mobile.
- Les données sont locales au navigateur utilisé.
