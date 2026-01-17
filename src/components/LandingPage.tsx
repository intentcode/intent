import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, loginWithGitHub, logout, type User } from "../lib/auth";

interface LandingPageProps {
  lang: "en" | "fr";
  onLangChange: (lang: "en" | "fr") => void;
}

const TRANSLATIONS = {
  en: {
    tagline: "Understand the why behind code changes",
    subtitle: "Intent shows code diffs alongside structured explanations. See design decisions, trade-offs, and rationale - not just what changed, but why.",
    placeholder: "Paste a GitHub URL (PR, repo, or branch comparison)",
    examples: "Examples:",
    examplePR: "github.com/owner/repo/pull/123",
    exampleCompare: "github.com/owner/repo/compare/main...feature",
    exampleRepo: "github.com/owner/repo",
    go: "View Intents",
    localMode: "Local Mode",
    localModeDesc: "For repos on your machine",
    loginHint: "Login with GitHub to access private repositories",
    tryDemo: "Try a demo",
    features: {
      chunks: {
        title: "Semantic Chunks",
        desc: "Code changes grouped by purpose, not just by file"
      },
      decisions: {
        title: "Design Decisions",
        desc: "Document the rationale behind implementation choices"
      },
      anchors: {
        title: "Smart Anchors",
        desc: "References that survive refactoring"
      }
    }
  },
  fr: {
    tagline: "Comprenez le pourquoi derrière les changements de code",
    subtitle: "Intent affiche les diffs de code avec des explications structurées. Voyez les décisions de design, les compromis et la logique - pas seulement ce qui a changé, mais pourquoi.",
    placeholder: "Collez une URL GitHub (PR, repo, ou comparaison de branches)",
    examples: "Exemples:",
    examplePR: "github.com/owner/repo/pull/123",
    exampleCompare: "github.com/owner/repo/compare/main...feature",
    exampleRepo: "github.com/owner/repo",
    go: "Voir les Intents",
    localMode: "Mode Local",
    localModeDesc: "Pour les repos sur votre machine",
    loginHint: "Connectez-vous avec GitHub pour accéder aux dépôts privés",
    tryDemo: "Essayer une démo",
    features: {
      chunks: {
        title: "Chunks Sémantiques",
        desc: "Changements groupés par objectif, pas juste par fichier"
      },
      decisions: {
        title: "Décisions de Design",
        desc: "Documentez la logique derrière les choix d'implémentation"
      },
      anchors: {
        title: "Ancres Intelligentes",
        desc: "Références qui survivent au refactoring"
      }
    }
  }
};

export function LandingPage({ lang, onLangChange }: LandingPageProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  const parseAndNavigate = (inputUrl: string) => {
    setError(null);

    // Clean the URL
    let cleanUrl = inputUrl.trim();
    if (!cleanUrl) return;

    // Remove protocol if present
    cleanUrl = cleanUrl.replace(/^https?:\/\//, "");
    // Remove github.com prefix if present
    cleanUrl = cleanUrl.replace(/^github\.com\//, "");

    // Try to parse as PR: owner/repo/pull/123
    const prMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (prMatch) {
      const [, owner, repo, prNumber] = prMatch;
      navigate(`/${owner}/${repo}/pull/${prNumber}`);
      return;
    }

    // Try to parse as compare: owner/repo/compare/base...head
    const compareMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/compare\/([^.]+)\.\.\.(.+)/);
    if (compareMatch) {
      const [, owner, repo, base, head] = compareMatch;
      navigate(`/${owner}/${repo}/compare/${base}...${head}`);
      return;
    }

    // Try to parse as tree/branch: owner/repo/tree/branch
    const treeMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/tree\/(.+)/);
    if (treeMatch) {
      const [, owner, repo, branch] = treeMatch;
      navigate(`/${owner}/${repo}/tree/${branch}`);
      return;
    }

    // Try to parse as simple repo: owner/repo
    const repoMatch = cleanUrl.match(/^([^/]+)\/([^/]+)$/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      navigate(`/${owner}/${repo}`);
      return;
    }

    setError(lang === "fr"
      ? "Format d'URL non reconnu. Essayez: owner/repo/pull/123 ou owner/repo"
      : "Unrecognized URL format. Try: owner/repo/pull/123 or owner/repo"
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    parseAndNavigate(url);
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">
          <img src="/intent_logo.png" alt="Intent" className="logo-icon" />
          <h1>Intent</h1>
        </div>
        <div className="landing-header-right">
          <div className="lang-selector">
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => onLangChange("en")}
            >
              EN
            </button>
            <button
              className={lang === "fr" ? "active" : ""}
              onClick={() => onLangChange("fr")}
            >
              FR
            </button>
          </div>
          <div className="auth-section">
            {user ? (
              <div className="user-menu">
                <img src={user.avatar} alt={user.login} className="user-avatar" />
                <span className="user-name">{user.login}</span>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            ) : (
              <button onClick={() => loginWithGitHub("/")} className="login-btn">
                Login with GitHub
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="landing-main">
        <div className="landing-hero">
          <h2 className="landing-tagline">{t.tagline}</h2>
          <p className="landing-subtitle">{t.subtitle}</p>
        </div>

        <form className="landing-form" onSubmit={handleSubmit}>
          <div className="landing-input-group">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t.placeholder}
              className="landing-input"
              autoFocus
            />
            <button type="submit" className="landing-submit" disabled={!url.trim()}>
              {t.go}
            </button>
          </div>
          {error && <div className="landing-error">{error}</div>}
          <div className="landing-examples">
            <span>{t.examples}</span>
            <code onClick={() => parseAndNavigate("intentcode/intent/pull/1")}>
              {t.examplePR}
            </code>
            <code onClick={() => parseAndNavigate("facebook/react/compare/main...canary")}>
              {t.exampleCompare}
            </code>
            <code onClick={() => parseAndNavigate("intentcode/intent")}>
              {t.exampleRepo}
            </code>
          </div>
        </form>

        {!user && (
          <div className="landing-login-hint">
            <span className="hint-icon">🔒</span>
            <span>{t.loginHint}</span>
          </div>
        )}

        <div className="landing-features">
          <div className="feature-card">
            <div className="feature-icon">📦</div>
            <h3>{t.features.chunks.title}</h3>
            <p>{t.features.chunks.desc}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💡</div>
            <h3>{t.features.decisions.title}</h3>
            <p>{t.features.decisions.desc}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>{t.features.anchors.title}</h3>
            <p>{t.features.anchors.desc}</p>
          </div>
        </div>

        <div className="landing-local">
          <a href="/local" className="local-link">
            <span className="local-icon">💻</span>
            <span className="local-text">
              <strong>{t.localMode}</strong>
              <small>{t.localModeDesc}</small>
            </span>
          </a>
        </div>
      </main>

      <footer className="landing-footer">
        <a href="https://github.com/intentcode/intent" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <span className="footer-separator">·</span>
        <a href="https://github.com/intentcode/intent#creating-intents" target="_blank" rel="noopener noreferrer">
          Docs
        </a>
      </footer>
    </div>
  );
}
