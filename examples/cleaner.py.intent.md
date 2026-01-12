# cleaner.py

## 2024-01-11 14:30 | Ajout feature claude note

### Recap
**Objectif:** Sauvegarder le contexte des messages marqués "claude note" avant suppression
**Risque:** Faible - Ajout pur, ne modifie pas la logique existante

### Chunks

#### L14-21 | Dataclass Note
Structure pour stocker les notes capturées: timestamp, texte du marker, messages de contexte, flag thread.
> Décision: Dataclass plutôt que dict pour la clarté et le typage

#### L40-41 | Initialisation liste notes
Liste vide initialisée dans __init__ pour accumuler les notes pendant le cleanup.

#### L77-78 | Capture pendant le scan
Appel de la méthode de capture pendant le scan existant des messages.
> Décision: Pas de 2ème passe sur les messages, capture au fil de l'eau pour performance

#### L165-167 | Capture dans les threads
Capture des notes dans les replies de thread avec le parent comme contexte potentiel.
> Décision: Passer parent_msg pour l'utiliser comme fallback contexte

#### L201-234 | Méthode _capture_notes_from_messages
Détecte "claude note" dans le texte, récupère les 2 messages précédents comme contexte.
> Décision: Détection case-insensitive pour flexibilité utilisateur
> Décision: Inclure le parent du thread comme fallback si pas assez de contexte dans les replies

#### L236-276 | Méthode _save_notes
Sauvegarde les notes en markdown formaté dans notes/notes.md.
> Décision: Format markdown lisible avec Context/Note sections
> Décision: Append au fichier existant pour garder l'historique

---

## 2024-01-10 23:15 | Passage à retention hours + thread logic

### Recap
**Objectif:** Changer la rétention de jours en heures (6h) et améliorer la gestion des threads
**Risque:** Moyen - Change la logique de suppression existante

### Chunks

#### L36-37 | Cutoff en heures
Calcul du cutoff basé sur retention_hours au lieu de retention_days.
> Décision: 6h par défaut plus adapté pour une conversation active

#### L102-121 | Nouvelle logique thread
Si un thread a de l'activité récente, garder les N derniers messages au lieu de tout supprimer.
> Décision: Garder 10 messages par défaut dans les threads actifs
> Décision: "Activité récente" = au moins 1 message < cutoff

---
