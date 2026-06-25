# Product

## Register

product

## Users

Paul Bindler (notaire, ~20 collaborateurs), utilisateur principal exclusif. Usage mobile-first sur iPhone, en mobilité — à la médiathèque, chez lui. Consulte ses prêts/réservations quotidiennement. Exigeant sur le design, habitué aux applications soignées. Modes préférés : grille 3×3 pour le catalogue, liste-image pour les prêts, vue points pour les listes.

## Product Purpose

PWA mobile-first permettant de consulter ses prêts et réservations aux Médiathèques de Strasbourg (Malraux + Neudorf), chercher dans le catalogue Iguana avec filtres de type et localisation, gérer des listes de souhaits multi-catégories (jeux PS5/PS4/Switch, films, BD, livres, musique, livres audio) avec vérification de disponibilité en temps réel, et recevoir des notifications push proactives (réservation disponible, retour imminent). Remplace le site officiel Iguana, difficile d'utilisation sur mobile.

## Brand Personality

Sobre, fiable, personnel. Outil quotidien privé — pas une vitrine. Inspire confiance (données live depuis la vraie bibliothèque). Navy comme structure d'ancrage, orange pour l'action, vert pour la disponibilité, bleu Neudorf pour la localisation.

## Anti-references

- **Site officiel médiathèques.strasbourg.eu** : dense, daté, illisible sur mobile
- **Apps entertainment grand public (Netflix, Spotify)** : trop de hiérarchie visuelle, trop d'images
- **Fond sombre ou violet** : explicitement rejeté
- **Direction PAPERBACK / beige / ivoire / sable / warm-tinted** : la bande warm-neutre AI par défaut, à proscrire absolument
- **SaaS cream ou editorial gray** : aesthetic AI générique

## Design Principles

1. **Lisibilité d'abord** : statut (disponible / emprunté / non trouvé) compréhensible en un coup d'œil, sans décoder des icônes abstraites
2. **Confiance par la transparence** : afficher la date de vérification, l'état réel, les erreurs — ne jamais masquer l'incertitude
3. **Mobile natif** : touch targets ≥44px, navigation par onglets en bas, pas de hover-only, pas de tableaux
4. **Palette assumée** : navy/orange/green/neudorf-blue — chaque couleur a un rôle fonctionnel précis, pas décoratif
5. **Persistance de l'intention** : recherches, filtres, préférences de vue survivent aux changements d'onglet

## Accessibility & Inclusion

WCAG AA minimum. Dark mode natif supporté (prefers-color-scheme). Réduction de mouvement respectée (prefers-reduced-motion). Taille de cible 44px sur la majorité des éléments interactifs.
