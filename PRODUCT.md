# Product

## Register

product

## Users

Paul (notaire, utilisateur principal), utilise l'app en mobilité — téléphone en main à la médiathèque ou depuis le canapé. Recherche rapide, pas de lecture longue. L'app doit répondre en quelques secondes et ne pas nécessiter d'apprentissage.

## Product Purpose

PWA mobile-first permettant de consulter ses prêts et réservations aux Médiathèques de Strasbourg, chercher dans le catalogue, et gérer des listes de souhaits avec vérification de disponibilité en temps réel. Remplace les allers-retours sur le site officiel Iguana, difficile d'utilisation sur mobile.

## Brand Personality

Sobre, fiable, personnel. L'app est un outil quotidien privé — pas une vitrine. Elle doit inspirer confiance (les données viennent de la vraie bibliothèque) et rester discrète : on vient pour trouver un jeu ou un film, pas pour admirer l'interface.

## Anti-references

- **Site officiel médiathèques.strasbourg.eu** : dense, daté, illisible sur mobile — l'exact opposé de ce qu'on veut
- **Apps entertainment grand public (Netflix, Spotify)** : trop de hiérarchie visuelle, trop d'images, trop de couleur — ce n'est pas une vitrine de contenu
- **Fond sombre ou violet** : explicitement rejeté par l'utilisateur

## Design Principles

1. **Lisibilité d'abord** : l'information (disponible / emprunté / non trouvé) doit être compréhensible en un coup d'œil, sans décoder des icônes abstraites
2. **Confiance par la transparence** : afficher la date de vérification, l'état réel, les erreurs — ne jamais masquer l'incertitude
3. **Mobile natif** : touch targets généreux, pas de hover-only, pas de tableaux, navigation par onglets en bas
4. **Sobriété assumée** : une interface qui s'efface derrière le contenu. Les couleurs servent le statut (vert = dispo, orange = emprunté, gris = inconnu), pas la décoration

## Accessibility & Inclusion

WCAG AA minimum. Usage mono-utilisateur donc pas de besoins spécifiques identifiés, mais dark mode natif supporté.
