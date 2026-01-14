import { useState, useEffect, useRef, useMemo } from "react";
import { parseIntent } from "./lib/parseIntent";
import { parseDiff } from "./lib/parseDiff";
import type { IntentFile, Session } from "./lib/parseIntent";
import type { DiffFile } from "./lib/parseDiff";
import { DiffViewer } from "./components/DiffViewer";
import { RepoSelector } from "./components/RepoSelector";
import { fetchDiff, fetchBrowse, fetchGitHubPR, fetchGitHubBranchesDiff, type DiffMode, type IntentV2API } from "./lib/api";
import "./App.css";

// ============ FILE 1: cleaner.py ============
const intentCleaner = `# cleaner.py

## 2024-01-11 14:30 | Ajout feature claude note

### Recap
**Objectif:** Sauvegarder le contexte des messages marqués "claude note" avant suppression
**Risque:** Faible - Ajout pur, ne modifie pas la logique existante

### Chunks

#### L14-21 | Dataclass Note
Structure pour stocker les notes capturées: timestamp, texte du marker, messages de contexte, flag thread.
> Décision: Dataclass plutôt que dict pour la clarté et le typage
@replaces L14-16 | Ancien dict non typé (NoteDict = dict) remplacé par une dataclass
@link notes_writer.py#L1-5 | Importée ici pour sérialiser les notes en markdown
@link config.py#L8-8 | Path utilise pathlib importé ici

#### L46-46 | Initialisation liste notes
Liste vide initialisée dans __init__ pour accumuler les notes pendant le cleanup.
@link cleaner.py#L14-21 | Type Note utilisé pour le typage de la liste

#### D14-16 | Suppression ancien système de notes
L'ancien système utilisait un simple dict non typé. Supprimé car remplacé par la dataclass Note.
> Décision: Le typing strict évite les bugs runtime
@link cleaner.py#L14-21 | Remplacé par la dataclass Note

#### L84-85 | Capture pendant le scan
Appel de la méthode de capture pendant le scan existant des messages.
> Décision: Pas de 2ème passe sur les messages, capture au fil de l'eau pour performance
@replaces L81-83 | Suppression de l'ancien logging verbose (logger.debug)
@link cleaner.py#L46-46 | Ajoute les notes à cette liste initialisée plus haut
@link config.py#L14-15 | Utilise notes_marker pour détecter les messages

#### D78-80 | Suppression logging debug
Les logs debug étaient trop verbeux et polluaient les sorties en production.
> Décision: Logging retiré, monitoring via métriques à la place

---
`;

const diffCleaner = `diff --git a/src/slack_cleaner/cleaner.py b/src/slack_cleaner/cleaner.py
--- a/src/slack_cleaner/cleaner.py
+++ b/src/slack_cleaner/cleaner.py
@@ -11,10 +11,15 @@ import httpx

 from .config import Settings

-# Old dict-based note storage (untyped)
-NoteDict = dict
-
+@dataclass
+class Note:
+    """A saved note with context."""
+    timestamp: datetime
+    marker_text: str
+    context: List[dict] = field(default_factory=list)
+    is_thread: bool = False
+

 class SlackCleaner:
     """Cleans messages from a Slack conversation."""

@@ -38,6 +43,7 @@ class SlackCleaner:
             settings.user_b_id: settings.user_b_token,
         }
         self._read_token = settings.user_a_token
+        self._notes: List[Note] = []

     def clean(self) -> int:
         """Clean messages older than retention_hours."""
@@ -75,9 +81,9 @@ class SlackCleaner:
                 if not messages:
                     break

-                # Debug logging
-                logger.debug(f"Processing batch of {len(messages)} messages")
-                logger.debug(f"Oldest: {messages[-1].get('ts')}")
+                # Capture notes from conversation
+                self._capture_notes_from_messages(messages, is_thread=False)
+
                 for msg in messages:
                     msg_ts = float(msg.get("ts", 0))
`;

// ============ FILE 2: config.py ============
const intentConfig = `# config.py

## 2024-01-11 14:30 | Ajout feature claude note

### Recap
**Objectif:** Ajouter la configuration pour le path de sauvegarde des notes
**Risque:** Faible - Ajout d'un champ optionnel

### Chunks

#### L7-7 | Import Path
Import de Path pour la gestion des chemins de fichiers.
> Décision: Utiliser pathlib plutôt que os.path pour la modernité
@replaces L7-8 | Suppression des imports os.path et os devenus inutiles
@link notes_writer.py#L8-19 | NotesWriter utilise Path pour gérer le fichier de sortie

#### D7-8 | Suppression imports legacy
Les imports os.path et os ne sont plus nécessaires avec pathlib.
> Décision: pathlib est plus moderne et cross-platform

#### L14-15 | Config notes_path
Nouveau champ optionnel pour spécifier où sauvegarder les notes extraites.
> Décision: Optionnel avec default None pour ne pas casser les configs existantes
@replaces L14-15 | Ancien output_dir et use_json supprimés
@link cleaner.py#L14-21 | Configure où sauvegarder les objets Note
@link notes_writer.py#L21-32 | Passé au writer pour l'écriture

#### D14-15 | Suppression ancienne config
output_dir et use_json supprimés car le nouveau système utilise notes_path avec format markdown.
> Décision: Simplification de la config, un seul paramètre au lieu de deux

---
`;

const diffConfig = `diff --git a/src/slack_cleaner/config.py b/src/slack_cleaner/config.py
--- a/src/slack_cleaner/config.py
+++ b/src/slack_cleaner/config.py
@@ -5,9 +5,8 @@
 from typing import Optional
 from dataclasses import dataclass
-import os.path
-import os
+from pathlib import Path

 @dataclass
 class Settings:
@@ -12,6 +11,8 @@ class Settings:
     user_b_id: str
     user_b_token: str
     retention_hours: int = 6
-    output_dir: str = "/tmp/slack_backup"
-    use_json: bool = True
+    notes_path: Optional[Path] = None
+    notes_marker: str = "claude note"
`;

// ============ FILE 3: notes_writer.py (nouveau fichier) ============
const intentNotesWriter = `# notes_writer.py

## 2024-01-11 14:30 | Ajout feature claude note

### Recap
**Objectif:** Module dédié à l'écriture des notes en markdown
**Risque:** Faible - Nouveau fichier isolé

### Chunks

#### L1-5 | Imports et dépendances
Imports nécessaires pour le writer: datetime, Path, et la dataclass Note.
> Décision: Import de Note depuis cleaner.py pour éviter la duplication
@link cleaner.py#L14-20 | Importe la dataclass Note définie ici

#### L8-19 | Classe NotesWriter
Classe responsable de la sérialisation des notes en markdown.
> Décision: Classe séparée pour respecter Single Responsibility Principle
> Décision: Format markdown pour lisibilité humaine
@replaces cleaner.py#L120-145 | Logique d'écriture extraite du cleaner (était mélangée avec la logique de cleanup)
@link config.py#L15-16 | Reçoit le path depuis la config notes_path

#### L21-32 | Méthode write
Écrit les notes dans le fichier avec formatage markdown structuré.
> Décision: Append mode pour ne pas perdre les notes précédentes
> Décision: Section datée pour faciliter la navigation
@replaces cleaner.py#L130-140 | Ancien code écrivait en JSON, maintenant markdown pour lisibilité
@link cleaner.py#L88-89 | Appelé après la capture des notes

---
`;

const diffNotesWriter = `diff --git a/src/slack_cleaner/notes_writer.py b/src/slack_cleaner/notes_writer.py
new file mode 100644
--- /dev/null
+++ b/src/slack_cleaner/notes_writer.py
@@ -0,0 +1,35 @@
+from datetime import datetime
+from pathlib import Path
+from typing import List
+
+from .cleaner import Note
+
+
+class NotesWriter:
+    """Writes captured notes to a markdown file."""
+
+    def __init__(self, output_path: Path):
+        self.output_path = output_path
+
+    def _format_note(self, note: Note) -> str:
+        lines = [f"### {note.timestamp.strftime('%H:%M')}"]
+        for msg in note.context:
+            lines.append(f"> {msg.get('text', '')}")
+        lines.append(f"\\nMarker: {note.marker_text}")
+        return "\\n".join(lines)
+
+    def write(self, notes: List[Note]) -> None:
+        if not notes:
+            return
+
+        content = [f"## {datetime.now().strftime('%Y-%m-%d')}\\n"]
+        for note in notes:
+            content.append(self._format_note(note))
+            content.append("\\n---\\n")
+
+        with open(self.output_path, "a") as f:
+            f.write("\\n".join(content))
+
+    def clear(self) -> None:
+        self.output_path.unlink(missing_ok=True)
`;

interface FileData {
  intent: IntentFile;
  diff: DiffFile;
  session: Session;
  filename: string;
  fullFileContent?: string; // For expand context feature
}

type Mode = "demo" | "live";
type Language = "en" | "fr" | "es" | "de";

// Context to track what diff is being displayed
interface DiffContext {
  type: "branches" | "browse" | "github-pr" | "github-branches";
  base?: string;
  head?: string;
  repoPath?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
}

const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
];

// UI translations
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    new: "New",
    existing: "Existing",
    context: "CONTEXT",
    notInDiff: "not in diff",
    summary: "Summary:",
    motivation: "Motivation:",
    files: "Files:",
    documentedFiles: "Documented files",
    modifiedFiles: "Modified files",
    warning: "Warning:",
    staleWarning: "Some chunks have been modified since last update.",
    modified: "Modified",
    noChanges: "No changes found",
    selectRepo: "Select a repository",
    loading: "Loading...",
    objective: "Objective:",
    risk: "Risk:",
    viewDiff: "Diff",
    viewBrowse: "Browse",
    deepDive: "Ask Claude",
    toastCopied: "Context copied! Paste it into Claude Code or claude.ai to explore this chunk.",
    toastError: "Error copying to clipboard",
    promptTitle: "Exploratory Parenthesis",
    promptDisclaimer: "This is a parenthesis to better understand a piece of code. This is NOT a new task.\nAfter this exploration, we'll resume where we left off.",
    promptContext: "Context",
    promptFile: "File",
    promptIntent: "Intent",
    promptChunkToExplore: "Chunk to explore",
    promptAnchor: "Anchor",
    promptTitleLabel: "Title",
    promptDescription: "Description",
    promptDecisions: "Decisions",
    promptSourceCode: "Source code",
    promptLines: "lines",
    promptCodeNotAvailable: "Code not available",
    promptQuestion: "My question",
    promptQuestionPlaceholder: "[Explain why this code is structured this way / What alternatives could have been used / I don't understand part X]",
    deepDiveTooltip: "Copy context to explore this chunk with Claude",
  },
  fr: {
    new: "Nouveau",
    existing: "Existant",
    context: "CONTEXTE",
    notInDiff: "hors diff",
    summary: "Résumé:",
    motivation: "Motivation:",
    files: "Fichiers:",
    documentedFiles: "Fichiers documentés",
    modifiedFiles: "Fichiers modifiés",
    warning: "Attention:",
    staleWarning: "Certains chunks ont été modifiés depuis la dernière mise à jour.",
    modified: "Modifié",
    noChanges: "Aucun changement trouvé",
    selectRepo: "Sélectionner un dépôt",
    loading: "Chargement...",
    objective: "Objectif:",
    risk: "Risque:",
    viewDiff: "Diff",
    viewBrowse: "Parcourir",
    deepDive: "Demander à Claude",
    toastCopied: "Contexte copié ! Colle-le dans Claude Code ou claude.ai pour explorer ce chunk.",
    toastError: "Erreur lors de la copie",
    promptTitle: "Parenthèse exploratoire",
    promptDisclaimer: "Ceci est une parenthèse pour mieux comprendre un morceau de code. Ce n'est PAS une nouvelle tâche.\nAprès cette exploration, on reprendra là où on en était.",
    promptContext: "Contexte",
    promptFile: "Fichier",
    promptIntent: "Intent",
    promptChunkToExplore: "Chunk à explorer",
    promptAnchor: "Ancre",
    promptTitleLabel: "Titre",
    promptDescription: "Description",
    promptDecisions: "Décisions",
    promptSourceCode: "Code source",
    promptLines: "lignes",
    promptCodeNotAvailable: "Code non disponible",
    promptQuestion: "Ma question",
    promptQuestionPlaceholder: "[Explique-moi pourquoi ce code est structuré ainsi / Quelles alternatives auraient été possibles / Je ne comprends pas la partie X]",
    deepDiveTooltip: "Copier le contexte pour explorer ce chunk avec Claude",
  },
  es: {
    new: "Nuevo",
    existing: "Existente",
    context: "CONTEXTO",
    notInDiff: "fuera del diff",
    summary: "Resumen:",
    motivation: "Motivación:",
    files: "Archivos:",
    documentedFiles: "Archivos documentados",
    modifiedFiles: "Archivos modificados",
    warning: "Atención:",
    staleWarning: "Algunos chunks han sido modificados desde la última actualización.",
    modified: "Modificado",
    noChanges: "No se encontraron cambios",
    selectRepo: "Seleccionar repositorio",
    loading: "Cargando...",
    objective: "Objetivo:",
    risk: "Riesgo:",
    viewDiff: "Diff",
    viewBrowse: "Explorar",
  },
  de: {
    new: "Neu",
    existing: "Bestehend",
    context: "KONTEXT",
    notInDiff: "nicht im Diff",
    summary: "Zusammenfassung:",
    motivation: "Motivation:",
    files: "Dateien:",
    documentedFiles: "Dokumentierte Dateien",
    modifiedFiles: "Geänderte Dateien",
    warning: "Achtung:",
    staleWarning: "Einige Chunks wurden seit dem letzten Update geändert.",
    modified: "Geändert",
    noChanges: "Keine Änderungen gefunden",
    selectRepo: "Repository auswählen",
    loading: "Laden...",
    objective: "Ziel:",
    risk: "Risiko:",
    viewDiff: "Diff",
    viewBrowse: "Durchsuchen",
  },
};

type ViewMode = "diff" | "browse";

function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [intentsV2, setIntentsV2] = useState<IntentV2API[]>([]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [mode] = useState<Mode>("live");
  void mode; // used for mode-based logic elsewhere
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const [lang, setLang] = useState<Language>("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffRequested, setDiffRequested] = useState(false);
  const [diffContext, setDiffContext] = useState<DiffContext | null>(null);
  const lastLoadParamsRef = useRef<{repoPath: string; diffMode: DiffMode; base: string; head: string} | null>(null);
  const isFirstRender = useRef(true);

  // Translation helper
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  // Filter intents to only show those with chunks in changed files
  // In browse mode, show all intents
  const filteredIntentsV2 = useMemo(() => {
    // In browse mode, show all intents without filtering
    if (viewMode === "browse") return intentsV2;

    if (changedFiles.length === 0) return intentsV2;

    return intentsV2.filter(intent => {
      // Check if any chunk in this intent resolves to a file in the diff
      return intent.resolvedChunks.some(chunk => {
        if (!chunk.resolvedFile) return false;
        // Check if resolvedFile matches any changed file
        return changedFiles.some(changed =>
          changed.includes(chunk.resolvedFile!) || chunk.resolvedFile!.includes(changed)
        );
      });
    });
  }, [intentsV2, changedFiles, viewMode]);

  // Reload when language changes
  useEffect(() => {
    // Skip the first render (initial mount)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const params = lastLoadParamsRef.current;
    if (params && !loading) {
      const { repoPath, diffMode, base, head } = params;
      loadFromRepo(repoPath, diffMode, base, head, lang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Load demo data
  const loadDemoData = () => {
    const fileConfigs = [
      { intent: intentCleaner, diff: diffCleaner },
      { intent: intentConfig, diff: diffConfig },
      { intent: intentNotesWriter, diff: diffNotesWriter },
    ];

    const parsed = fileConfigs.map(({ intent, diff }) => {
      const parsedIntent = parseIntent(intent);
      const parsedDiff = parseDiff(diff);
      const filename = parsedDiff[0]?.newPath || parsedDiff[0]?.oldPath || parsedIntent.filename;
      return {
        intent: parsedIntent,
        diff: parsedDiff[0],
        session: parsedIntent.sessions[0],
        filename: filename.split("/").pop() || filename,
      };
    });

    setFiles(parsed);
    setIntentsV2([]); // Clear v2 intents in demo mode
    setDiffRequested(false);
    setDiffContext(null); // Clear diff context in demo mode
  };

  // Load from git repo
  const loadFromRepo = async (repoPath: string, diffMode: DiffMode, base: string, head: string, langOverride?: Language) => {
    setLoading(true);
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: diffMode,
      base,
      head,
      repoPath,
    });
    lastLoadParamsRef.current = { repoPath, diffMode, base, head };

    try {
      // Pass language for intent file lookup (en is base, others have suffix)
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchDiff(repoPath, diffMode, base, head, langParam);
      const diffFiles = parseDiff(response.diff);

      // Store v2 intents and changed files
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.changedFiles || []);

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;
        const intentContent = response.intents[filePath];
        const fullFileContent = response.fileContents?.[filePath];

        let intent: IntentFile;
        let session: Session;

        if (intentContent) {
          intent = parseIntent(intentContent);
          session = intent.sessions[0];
        } else {
          // Create empty intent/session for files without intent.md
          intent = { filename, sessions: [] };
          session = {
            date: "",
            title: "No intent file",
            objective: "",
            risk: "",
            chunks: [],
          };
        }

        return {
          intent,
          diff: diffFile,
          session,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
      setViewMode("diff"); // Set view mode to diff for compare
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  };

  // Load browse mode - view a single branch with intents
  const loadBrowse = async (repoPath: string, branch: string, langOverride?: Language) => {
    setLoading(true);
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "browse",
      head: branch,
      repoPath,
    });
    setViewMode("browse"); // Set view mode to browse

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchBrowse(repoPath, branch, langParam);

      // Store v2 intents
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.files || []);

      // Create file data for each file in intents
      const parsed: FileData[] = response.files.map((filePath) => {
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        // Create empty intent/session for files
        const intent: IntentFile = { filename, sessions: [] };
        const session: Session = {
          date: "",
          title: `${branch}`,
          objective: `Browsing ${filePath}`,
          risk: "",
          chunks: [],
        };

        // Create a fake diff file with no hunks (browse mode)
        const diff: DiffFile = {
          oldPath: filePath,
          newPath: filePath,
          hunks: [],
        };

        return {
          intent,
          diff,
          session,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse branch");
    } finally {
      setLoading(false);
    }
  };

  // Load from GitHub PR
  const loadFromGitHub = async (owner: string, repo: string, prNumber: number) => {
    setLoading(true);
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "github-pr",
      owner,
      repo,
      prNumber,
    });

    try {
      const response = await fetchGitHubPR(owner, repo, prNumber);
      const diffFiles = parseDiff(response.diff);

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;

        // Create session from PR info
        const intent: IntentFile = { filename, sessions: [] };
        const session: Session = {
          date: new Date().toISOString().split("T")[0],
          title: response.prInfo.title,
          objective: `PR #${response.prInfo.number} by ${response.prInfo.author}`,
          risk: `${response.prInfo.base} ← ${response.prInfo.head}`,
          chunks: [],
        };

        return {
          intent,
          diff: diffFile,
          session,
          filename,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub PR");
    } finally {
      setLoading(false);
    }
  };

  // Load from GitHub branches comparison
  const loadFromGitHubBranches = async (owner: string, repo: string, base: string, head: string) => {
    setLoading(true);
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "github-branches",
      base,
      head,
      owner,
      repo,
    });

    try {
      const response = await fetchGitHubBranchesDiff(owner, repo, base, head);
      const diffFiles = parseDiff(response.diff);

      // Store v2 intents and changed files
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.changedFiles || []);

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;

        // Create session from branch comparison info
        const intent: IntentFile = { filename, sessions: [] };
        const session: Session = {
          date: new Date().toISOString().split("T")[0],
          title: `${owner}/${repo}`,
          objective: `Comparing ${base}...${head}`,
          risk: response.branchInfo ? `${response.branchInfo.totalCommits} commits` : "",
          chunks: [],
        };

        return {
          intent,
          diff: diffFile,
          session,
          filename,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub branches diff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "demo") {
      loadDemoData();
    }
  }, [mode]);

  const handleLinkClick = (targetFile: string, targetRange: string) => {
    // Find the target element and scroll to it
    const targetId = `chunk-${targetFile}-${targetRange}`;
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("chunk-highlight");
      setTimeout(() => element.classList.remove("chunk-highlight"), 2000);
    }
  };

  // Get the session info from the first file (they share the same PR info)
  const prSession = files.length > 0 ? files[0].session : null;

  // Helper to render the diff context info
  const renderDiffContextBadge = () => {
    if (!diffContext) return null;

    const getLabel = () => {
      switch (diffContext.type) {
        case "browse":
          return `${diffContext.head}`;
        case "branches":
          return `${diffContext.base} → ${diffContext.head}`;
        case "github-pr":
          return `PR #${diffContext.prNumber}`;
        case "github-branches":
          return `${diffContext.owner}/${diffContext.repo}: ${diffContext.base} → ${diffContext.head}`;
        default:
          return "";
      }
    };

    const getIcon = () => {
      switch (diffContext.type) {
        case "browse":
          return "📖";
        case "branches":
        case "github-branches":
          return "🔀";
        case "github-pr":
          return "🔗";
        default:
          return "📄";
      }
    };

    const getRepoName = () => {
      if (diffContext.type === "github-pr" || diffContext.type === "github-branches") {
        return `${diffContext.owner}/${diffContext.repo}`;
      }
      if (diffContext.repoPath) {
        return diffContext.repoPath.split("/").pop() || diffContext.repoPath;
      }
      return "";
    };

    return (
      <div className="diff-context-badge">
        <span className="diff-context-icon">{getIcon()}</span>
        <span className="diff-context-repo">{getRepoName()}</span>
        <span className="diff-context-separator">|</span>
        <span className="diff-context-label">{getLabel()}</span>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Intent</h1>
        <span className="tagline">Intent-based code review</span>
        <div className="lang-selector">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? "active" : ""}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {mode === "live" && (
        <RepoSelector
          onLoadLocal={loadFromRepo}
          onLoadBrowse={loadBrowse}
          onLoadGitHub={loadFromGitHub}
          onLoadGitHubBranches={loadFromGitHubBranches}
          loading={loading}
          error={error}
          defaultPath="/Users/berengerouadi/WorkingLab/personal/slack-cleaner"
          defaultMode="branches"
          defaultBase="main"
          defaultHead="feat/add-intents"
        />
      )}

      {/* Show diff context badge when a diff was requested */}
      {mode === "live" && diffContext && !loading && (
        <div className="diff-context-container">
          {renderDiffContextBadge()}
        </div>
      )}

      {files.length === 0 && mode === "live" && !loading && !diffRequested && (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-title">Select a repository</div>
          <div className="empty-state-hint">Browse for a git repository, then choose the branches to compare</div>
        </div>
      )}

      {files.length === 0 && mode === "live" && !loading && diffRequested && !error && filteredIntentsV2.length === 0 && (
        <div className="empty-state no-diff">
          <div className="no-diff-icon">📭</div>
          <div className="no-diff-title">No changes found</div>
          <div className="no-diff-hint">
            {diffContext?.type === "branches" && `Branches ${diffContext.base} and ${diffContext.head} are identical.`}
            {diffContext?.type === "github-pr" && "This PR has no file changes."}
            {diffContext?.type === "github-branches" && `Branches ${diffContext.base} and ${diffContext.head} are identical.`}
            {!diffContext && "The branches might be identical or contain only intent files."}
          </div>
        </div>
      )}

      {/* Show intents even without code diff - unified design */}
      {files.length === 0 && mode === "live" && !loading && diffRequested && !error && filteredIntentsV2.length > 0 && (
        <>
          {/* Intent recap at top - like PR recap */}
          {filteredIntentsV2.map((intent, intentIdx) => (
            <div key={intentIdx} className="pr-recap intent-recap">
              <div className="pr-meta">
                <span className="pr-date">{intent.frontmatter.date || ''}</span>
                <span className="pr-title">{intent.title}</span>
                {intent.frontmatter.risk && (
                  <span className={`risk-badge risk-${intent.frontmatter.risk}`}>{intent.frontmatter.risk}</span>
                )}
              </div>
              <div className="pr-info">
                <div className="pr-item">
                  <span className="pr-label">{t('summary')}</span>
                  <span className="pr-value">{intent.summary}</span>
                </div>
                {intent.motivation && (
                  <div className="pr-item">
                    <span className="pr-label">{t('motivation')}</span>
                    <span className="pr-value">{intent.motivation}</span>
                  </div>
                )}
                <div className="pr-item">
                  <span className="pr-label">{t('files')}</span>
                  <span className="pr-value">{intent.frontmatter.files.join(', ')}</span>
                </div>
                {filteredIntentsV2.some(i => i.resolvedChunks.some(c => c.hashMatch === false)) && (
                  <div className="pr-item">
                    <span className="pr-label stale-warning">{t('warning')}</span>
                    <span className="pr-value stale-warning">{t('staleWarning')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          <main className="app-main">
            {/* File Tree Sidebar */}
            <div className="files-sidebar">
              <div className="sidebar-title">{t('documentedFiles')}</div>
              <div className="file-tree">
                {filteredIntentsV2.map((intent, i) => (
                  intent.frontmatter.files.map((file, j) => (
                    <div
                      key={`${i}-${j}`}
                      className="tree-file documented"
                      onClick={() => {
                        const el = document.getElementById(`intent-file-${i}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span className="tree-file-icon">📄</span>
                      {file.split('/').pop()}
                    </div>
                  ))
                ))}
              </div>
            </div>

            {/* Files Content - using unified DiffViewer */}
            <div className="files-content">
              {filteredIntentsV2.map((intent, i) => (
                <div key={i} id={`intent-file-${i}`}>
                  <DiffViewer
                    filename={intent.frontmatter.files[0] || 'unknown'}
                    resolvedChunks={intent.resolvedChunks.filter(c => c.resolved?.content)}
                    intentTitle={intent.title}
                    onLinkClick={handleLinkClick}
                    translations={{
                      new: t('new'), existing: t('existing'), context: t('context'), notInDiff: t('notInDiff'), modified: t('modified'),
                      deepDive: t('deepDive'), toastCopied: t('toastCopied'), toastError: t('toastError'),
                      promptTitle: t('promptTitle'), promptDisclaimer: t('promptDisclaimer'), promptContext: t('promptContext'),
                      promptFile: t('promptFile'), promptIntent: t('promptIntent'), promptChunkToExplore: t('promptChunkToExplore'),
                      promptAnchor: t('promptAnchor'), promptTitleLabel: t('promptTitleLabel'), promptDescription: t('promptDescription'),
                      promptDecisions: t('promptDecisions'), promptSourceCode: t('promptSourceCode'), promptLines: t('promptLines'),
                      promptCodeNotAvailable: t('promptCodeNotAvailable'), promptQuestion: t('promptQuestion'),
                      promptQuestionPlaceholder: t('promptQuestionPlaceholder'), deepDiveTooltip: t('deepDiveTooltip')
                    }}
                  />
                </div>
              ))}
            </div>
          </main>
        </>
      )}

      {files.length === 0 && loading && (
        <div className="loading">{t('loading')}</div>
      )}

      {prSession && files.length > 0 && (
        <>
      {/* PR-level recap - hide if we have v2 intents (they have their own recap) */}
      {filteredIntentsV2.length === 0 && prSession.title !== "No intent file" && (
        <div className="pr-recap">
          <div className="pr-meta">
            <span className="pr-date">{prSession.date}</span>
            <span className="pr-title">{prSession.title}</span>
          </div>
          <div className="pr-info">
            <div className="pr-item">
              <span className="pr-label">{t('objective')}</span>
              <span className="pr-value">{prSession.objective}</span>
            </div>
            <div className="pr-item">
              <span className="pr-label">{t('risk')}</span>
              <span className={`risk-badge risk-${prSession.risk.split(" ")[0].toLowerCase()}`}>
                {prSession.risk}
              </span>
            </div>
            <div className="pr-item">
              <span className="pr-label">{t('files')}</span>
              <span className="pr-value">{files.length} {t('modified').toLowerCase()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Intent summaries when available */}
      {filteredIntentsV2.length > 0 && (
        <div className="intents-summary">
          <div className="intents-summary-header">
            <span className="intents-count">{filteredIntentsV2.length} Intent{filteredIntentsV2.length > 1 ? 's' : ''}</span>
          </div>
          <div className="intents-summary-list">
            {filteredIntentsV2.map((intent, idx) => {
              const staleCount = intent.resolvedChunks.filter(c => c.hashMatch === false).length;
              const _unresolvedCount = intent.resolvedChunks.filter(c => c.resolved === null).length;
              void _unresolvedCount; // available for future use
              return (
                <div key={idx} className="intent-summary-card">
                  <div className="intent-summary-header">
                    <span className="intent-summary-id">#{intent.frontmatter.id}</span>
                    <span className="intent-summary-title">{intent.title}</span>
                    {intent.frontmatter.risk && (
                      <span className={`risk-badge risk-${intent.frontmatter.risk}`}>{intent.frontmatter.risk}</span>
                    )}
                    {staleCount > 0 && (
                      <span className="warning-badge stale-warning">{staleCount} stale</span>
                    )}
                  </div>
                  <p className="intent-summary-text">{intent.summary}</p>
                  <div className="intent-summary-meta">
                    <span className="intent-chunks-count">{intent.resolvedChunks.length} chunks</span>
                    {intent.frontmatter.tags && intent.frontmatter.tags.map((tag, i) => (
                      <span key={i} className="tag-pill">{tag}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <main className="app-main">
        {/* File Tree Sidebar */}
        <div className="files-sidebar">
          <div className="sidebar-title">{t('modifiedFiles')}</div>
          <div className="file-tree">
            <div className="tree-folder">
              <span className="tree-folder-icon">📁</span>
              src/slack_cleaner/
            </div>
            {files.map((file, i) => {
              const isNew = file.diff.oldPath === "/dev/null" || !file.diff.oldPath;
              return (
                <div
                  key={i}
                  className={`tree-file ${isNew ? "added" : "modified"}`}
                  onClick={() => {
                    const el = document.getElementById(`file-${file.filename}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span className="tree-file-icon">{isNew ? "+" : "M"}</span>
                  {file.filename}
                </div>
              );
            })}
          </div>
        </div>

        {/* Files Content */}
        <div className="files-content">
          {files.map((file, i) => {
            // Find all chunks from filtered intents that match this file
            const filePath = file.diff.newPath || file.diff.oldPath || file.filename;
            const fileChunks = filteredIntentsV2.flatMap(intent =>
              intent.resolvedChunks.filter(chunk => {
                // Check if chunk's resolvedFile matches this diff file
                if (!chunk.resolvedFile) return false;
                return filePath.includes(chunk.resolvedFile) || chunk.resolvedFile.includes(file.filename);
              }).map(chunk => ({
                ...chunk,
                intentId: intent.frontmatter.id,
                intentTitle: intent.title,
                isNew: intent.isNew ?? false,
              }))
            );

            return (
              <div key={i} id={`file-${file.filename}`}>
                <DiffViewer
                  file={file.diff}
                  session={file.session}
                  filename={file.filename}
                  onLinkClick={handleLinkClick}
                  fullFileContent={file.fullFileContent}
                  resolvedChunks={fileChunks}
                  viewMode={viewMode}
                  translations={{
                    new: t('new'), existing: t('existing'), context: t('context'), notInDiff: t('notInDiff'), modified: t('modified'),
                    deepDive: t('deepDive'), toastCopied: t('toastCopied'), toastError: t('toastError'),
                    promptTitle: t('promptTitle'), promptDisclaimer: t('promptDisclaimer'), promptContext: t('promptContext'),
                    promptFile: t('promptFile'), promptIntent: t('promptIntent'), promptChunkToExplore: t('promptChunkToExplore'),
                    promptAnchor: t('promptAnchor'), promptTitleLabel: t('promptTitleLabel'), promptDescription: t('promptDescription'),
                    promptDecisions: t('promptDecisions'), promptSourceCode: t('promptSourceCode'), promptLines: t('promptLines'),
                    promptCodeNotAvailable: t('promptCodeNotAvailable'), promptQuestion: t('promptQuestion'),
                    promptQuestionPlaceholder: t('promptQuestionPlaceholder'), deepDiveTooltip: t('deepDiveTooltip')
                  }}
                />
              </div>
            );
          })}
        </div>
      </main>
        </>
      )}
    </div>
  );
}

export default App;
