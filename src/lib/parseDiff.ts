// Parser for unified diff format

export interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  startLineOld: number;
  startLineNew: number;
  lines: DiffLine[];
  isVirtual?: boolean; // True if this is a virtual hunk for context display
  chunkAnchor?: string; // Reference to the chunk anchor if virtual
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split("\n");

  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // File header: diff --git a/file b/file
    if (line.startsWith("diff --git")) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }
      currentFile = { oldPath: "", newPath: "", hunks: [] };
      currentHunk = null;
      continue;
    }

    // Old file path: --- a/file
    if (line.startsWith("--- ") && currentFile) {
      currentFile.oldPath = line.slice(4).replace(/^a\//, "");
      continue;
    }

    // New file path: +++ b/file
    if (line.startsWith("+++ ") && currentFile) {
      currentFile.newPath = line.slice(4).replace(/^b\//, "");
      continue;
    }

    // Hunk header: @@ -14,0 +14,8 @@
    if (line.startsWith("@@") && currentFile) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        oldLineNum = parseInt(match[1]);
        newLineNum = parseInt(match[2]);
        currentHunk = {
          header: line,
          startLineOld: oldLineNum,
          startLineNew: newLineNum,
          lines: [{ type: "header", content: line }],
        };
      }
      continue;
    }

    // Diff lines
    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: line.slice(1),
          newLineNumber: newLineNum++,
        });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "remove",
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
        });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1) || "",
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  // Save last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

// Check if a line number falls within a chunk's range
export function getChunkForLine(
  lineNumber: number,
  chunks: { startLine: number; endLine: number }[]
): number {
  return chunks.findIndex(
    (chunk) => lineNumber >= chunk.startLine && lineNumber <= chunk.endLine
  );
}
