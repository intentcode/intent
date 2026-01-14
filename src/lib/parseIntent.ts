// Parser for .intent.md files

export interface Decision {
  text: string;
}

export interface ChunkLink {
  targetFile: string;    // e.g., "cleaner.py"
  targetRange: string;   // e.g., "L14-20"
  reason: string;        // e.g., "Utilise la structure Note"
}

export interface ChunkReplaces {
  oldFile?: string;      // e.g., "cleaner.py" - optional, for cross-file replaces
  oldRange: string;      // e.g., "L45-60" - lines in the OLD file
  reason: string;        // e.g., "Ancien système vulnérable"
}

export interface Chunk {
  lineRange: string; // e.g., "L14-21" or "D14-16" for deletions
  startLine: number;
  endLine: number;
  isDeletion: boolean; // true if this chunk explains deleted lines (D prefix)
  title: string;
  description: string;
  decisions: Decision[];
  links: ChunkLink[];
  replaces: ChunkReplaces[];
}

export interface Session {
  date: string;
  title: string;
  objective: string;
  risk: string;
  chunks: Chunk[];
}

export interface IntentFile {
  filename: string;
  sessions: Session[];
}

export function parseIntent(markdown: string): IntentFile {
  const lines = markdown.split("\n");
  let filename = "";
  const sessions: Session[] = [];
  let currentSession: Session | null = null;
  let currentChunk: Chunk | null = null;
  let inDescription = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse filename (# filename)
    if (line.startsWith("# ") && !filename) {
      filename = line.slice(2).trim();
      continue;
    }

    // Parse session header (## date | title)
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      // Save previous session
      if (currentSession) {
        if (currentChunk) {
          currentSession.chunks.push(currentChunk);
          currentChunk = null;
        }
        sessions.push(currentSession);
      }

      const headerMatch = line.match(/^## (.+?) \| (.+)$/);
      if (headerMatch) {
        currentSession = {
          date: headerMatch[1].trim(),
          title: headerMatch[2].trim(),
          objective: "",
          risk: "",
          chunks: [],
        };
      }
      inDescription = false;
      continue;
    }

    // Parse recap section
    if (line.startsWith("**Objectif:**") && currentSession) {
      currentSession.objective = line.replace("**Objectif:**", "").trim();
      continue;
    }

    if (line.startsWith("**Risque:**") && currentSession) {
      currentSession.risk = line.replace("**Risque:**", "").trim();
      continue;
    }

    // Parse chunk header (#### L14-21 | Title) or (#### D14-16 | Title) for deletions
    if (line.startsWith("#### ") && currentSession) {
      // Save previous chunk
      if (currentChunk) {
        currentSession.chunks.push(currentChunk);
      }

      // Match both L (new lines) and D (deleted lines) prefixes
      const chunkMatch = line.match(/^#### ([LD]\d+-\d+) \| (.+)$/);
      if (chunkMatch) {
        const lineRange = chunkMatch[1];
        const isDeletion = lineRange.startsWith("D");
        const rangeMatch = lineRange.match(/[LD](\d+)-(\d+)/);
        currentChunk = {
          lineRange,
          startLine: rangeMatch ? parseInt(rangeMatch[1]) : 0,
          endLine: rangeMatch ? parseInt(rangeMatch[2]) : 0,
          isDeletion,
          title: chunkMatch[2].trim(),
          description: "",
          decisions: [],
          links: [],
          replaces: [],
        };
        inDescription = true;
      }
      continue;
    }

    // Parse links (@link file.py#L14-20 | reason)
    if (line.startsWith("@link ") && currentChunk) {
      const linkMatch = line.match(/^@link ([^#]+)#(L\d+-\d+) \| (.+)$/);
      if (linkMatch) {
        currentChunk.links.push({
          targetFile: linkMatch[1].trim(),
          targetRange: linkMatch[2].trim(),
          reason: linkMatch[3].trim(),
        });
      }
      inDescription = false;
      continue;
    }

    // Parse replaces (@replaces L45-60 | reason) or (@replaces file.py#L45-60 | reason)
    if (line.startsWith("@replaces ") && currentChunk) {
      // Try cross-file format first: @replaces file.py#L45-60 | reason
      const crossFileMatch = line.match(/^@replaces ([^#]+)#(L\d+-\d+) \| (.+)$/);
      if (crossFileMatch) {
        currentChunk.replaces.push({
          oldFile: crossFileMatch[1].trim(),
          oldRange: crossFileMatch[2].trim(),
          reason: crossFileMatch[3].trim(),
        });
      } else {
        // Same file format: @replaces L45-60 | reason
        const sameFileMatch = line.match(/^@replaces (L\d+-\d+) \| (.+)$/);
        if (sameFileMatch) {
          currentChunk.replaces.push({
            oldRange: sameFileMatch[1].trim(),
            reason: sameFileMatch[2].trim(),
          });
        }
      }
      inDescription = false;
      continue;
    }

    // Parse decisions (> Décision: ...)
    if (line.startsWith("> Décision:") && currentChunk) {
      currentChunk.decisions.push({
        text: line.replace("> Décision:", "").trim(),
      });
      inDescription = false;
      continue;
    }

    // Parse description (lines after chunk header, before decisions)
    if (inDescription && currentChunk && line.trim() && !line.startsWith(">")) {
      if (currentChunk.description) {
        currentChunk.description += " " + line.trim();
      } else {
        currentChunk.description = line.trim();
      }
      continue;
    }

    // Skip separator and empty lines
    if (line.startsWith("---") || line.startsWith("### Recap") || line.startsWith("### Chunks")) {
      inDescription = false;
      continue;
    }
  }

  // Save last chunk and session
  if (currentSession) {
    if (currentChunk) {
      currentSession.chunks.push(currentChunk);
    }
    sessions.push(currentSession);
  }

  return { filename, sessions };
}
