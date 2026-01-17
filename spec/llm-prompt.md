# LLM Prompt for Generating Intent Files

Ce document contient les prompts pour générer des fichiers intent avec un LLM.

---

## Option 1: System Prompt (ajout au CLAUDE.md ou system prompt)

```markdown
## Intent Documentation

Quand tu fais des changements de code significatifs, génère un fichier intent qui explique le "pourquoi" derrière tes changements.

### Format Intent v2

Les intents sont stockés dans `.intent/intents/` avec un manifest `.intent/manifest.yaml`.

Structure d'un fichier intent:

```markdown
---
id: feature-name
from: commit-or-branch
author: claude
date: 2024-01-15
status: active
risk: low|medium|high
tags: [feature, bugfix, refactor]
files:
  - src/path/to/file.ts
  - src/another/file.py
---

# Titre du changement
# fr: Titre en français (optionnel)

## Summary
en: Description en anglais de ce que ce changement accomplit.
fr: Description en français (optionnel).

## Motivation
en: Pourquoi ce changement était nécessaire.

## Chunks

### @function:nom_fonction | Titre du chunk
### fr: Titre en français (optionnel)

en: Description de ce que ce code fait et pourquoi.

Points clés:
- Point 1
- Point 2

> Decision: Justification d'un choix spécifique
> fr: Justification en français (optionnel)

@link @function:autre_fonction | Utilise cette fonction
@link autre_fichier.py@function:helper | Dépend de ce helper
```

### Types d'ancres (du plus robuste au moins robuste)

| Ancre | Usage | Exemple |
|-------|-------|---------|
| `@function:name` | Fonction/méthode | `@function:validateUser` |
| `@class:Name` | Classe | `@class:UserService` |
| `@method:Class.method` | Méthode dans une classe | `@method:UserService.validate` |
| `@pattern:code` | Texte à rechercher | `@pattern:if __name__` |
| `@chunk:id` | Chunk conceptuel (pas de code) | `@chunk:architecture-overview` |
| `@line:10-20` | Lignes explicites (fragile!) | `@line:42-58` |

### Règles

1. **Préfère les ancres sémantiques** (`@function`, `@class`) aux `@line` - elles survivent au refactoring

2. **Explique le "pourquoi"**, pas juste le "quoi"
   - ❌ "Added error handling"
   - ✅ "Added try/catch because the API can timeout under heavy load"

3. **Un chunk par concept** - ne sur-documente pas
   - Groupe les changements liés
   - Sépare les changements non liés

4. **Utilise les liens** pour connecter le code
   - `@link @function:helper` - même fichier
   - `@link utils.py@function:parse` - autre fichier
   - `@link @chunk:overview` - référence conceptuelle

5. **Évalue le risque honnêtement**
   - `low`: Changement isolé, facile à reverter
   - `medium`: Touche plusieurs fichiers, tests nécessaires
   - `high`: Changement architectural, sécurité, données

### Quand générer un intent

✅ Génère un intent pour:
- Nouvelles features
- Bug fixes non-triviaux
- Refactoring
- Décisions architecturales
- Suppression de code significatif

❌ Skip pour:
- Typos
- Formatting
- Import sorting
- Fixes d'une ligne évidents
```

---

## Option 2: Prompt One-Shot (copier-coller dans n'importe quel LLM)

```
Tu es un expert en documentation de code. Génère un fichier intent.md pour expliquer les changements suivants.

FORMAT REQUIS:
- YAML frontmatter avec: id, from, date, status, risk, tags, files
- Section Summary et Motivation
- Chunks avec ancres sémantiques (@function:name, @class:Name, etc.)
- Decisions (> Decision: ...) pour expliquer les choix
- Links (@link ...) pour connecter le code

TYPES D'ANCRES (préfère les premiers):
1. @function:nom - pour les fonctions
2. @class:Nom - pour les classes
3. @method:Classe.methode - pour les méthodes
4. @pattern:texte - pour du texte à chercher
5. @chunk:id - pour du contenu conceptuel sans code
6. @line:10-20 - ÉVITE si possible (fragile)

RÈGLES:
- Explique le POURQUOI, pas juste le QUOI
- Un chunk = un concept
- Risque: low/medium/high selon l'impact
- Lie le code avec @link

DIFF À ANALYSER:
<diff>
{colle ton diff ici}
</diff>

Génère le fichier intent.md complet.
```

---

## Option 3: Prompt Interactif (session de coding)

```
Je vais implémenter: {description de la feature}

Aide-moi à documenter l'intent au fur et à mesure:

1. Après chaque changement significatif, suggère un chunk avec:
   - Ancre sémantique appropriée
   - Description du "pourquoi"
   - Décisions prises

2. Identifie les liens vers d'autre code

3. À la fin, génère le fichier intent.md complet

Premier changement:
{code ou diff}
```

---

## Option 4: Claude Code Hook

Crée un fichier `.claude/hooks/post-commit.sh`:

```bash
#!/bin/bash
# Hook pour générer/mettre à jour les intents après un commit

# Récupère le diff du dernier commit
DIFF=$(git diff HEAD~1)

# Génupère le prompt
cat << EOF
Analyse ce diff et mets à jour les fichiers intent si nécessaire.

Règles:
- Lis .intent/manifest.yaml pour voir les intents existants
- Mets à jour les intents touchés par ce commit
- Crée un nouvel intent si c'est une nouvelle feature
- Utilise le format v2 avec ancres sémantiques

Diff:
$DIFF
EOF
```

---

## Option 5: MCP Tool (pour intégration programmatique)

```typescript
// Tool MCP pour générer des intents
{
  name: "generate_intent",
  description: "Génère un fichier intent à partir d'un diff ou de fichiers modifiés",
  parameters: {
    diff: "string - le diff git à analyser",
    files: "string[] - liste des fichiers modifiés",
    existing_intents: "string[] - intents existants à potentiellement mettre à jour"
  }
}
```

---

## Checklist de validation

Avant de finaliser un intent, vérifie:

- [ ] Les ancres pointent vers du code qui existe
- [ ] Chaque chunk a un "pourquoi" clair
- [ ] Le risque est réaliste
- [ ] Les décisions mentionnent les alternatives considérées
- [ ] Les liens sont valides
- [ ] Le manifest.yaml est mis à jour
- [ ] Les fichiers listés dans `files:` sont corrects

---

## Auto-évolution

Ce prompt doit évoluer avec le projet. Pour le mettre à jour:

1. Consulte `/spec/intent-format.md` pour le format officiel
2. Consulte `CLAUDE.md` pour le contexte projet
3. Regarde les exemples dans `.intent/intents/`
4. Adapte le prompt en conséquence

Le LLM qui génère des intents devrait toujours lire ces fichiers pour s'assurer de suivre le format actuel.
