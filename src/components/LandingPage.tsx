import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, loginWithGitHub, logout, type User } from "../lib/auth";
import { TRANSLATIONS, type Language } from "../lib/language";
import "./LandingPage.css";

interface LandingPageProps {
  lang: Language;
  onLangChange: (lang: Language) => void;
}

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
    let cleanUrl = inputUrl.trim();
    if (!cleanUrl) return;

    cleanUrl = cleanUrl.replace(/^https?:\/\//, "");
    cleanUrl = cleanUrl.replace(/^github\.com\//, "");

    // PR: owner/repo/pull/123
    const prMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (prMatch) {
      navigate(`/${prMatch[1]}/${prMatch[2]}/pull/${prMatch[3]}`);
      return;
    }

    // Compare: owner/repo/compare/base...head
    const compareMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/compare\/([^.]+)\.\.\.(.+)/);
    if (compareMatch) {
      navigate(`/${compareMatch[1]}/${compareMatch[2]}/compare/${compareMatch[3]}...${compareMatch[4]}`);
      return;
    }

    // Tree: owner/repo/tree/branch
    const treeMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/tree\/(.+)/);
    if (treeMatch) {
      navigate(`/${treeMatch[1]}/${treeMatch[2]}/tree/${treeMatch[3]}`);
      return;
    }

    // Repo: owner/repo
    const repoMatch = cleanUrl.match(/^([^/]+)\/([^/]+)\/?$/);
    if (repoMatch) {
      navigate(`/${repoMatch[1]}/${repoMatch[2]}`);
      return;
    }

    setError(t.urlError);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    parseAndNavigate(url);
  };

  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-container">
          <a href="/" className="landing-nav-logo">
            <img src="/intent_logo.png" alt="Intent" className="landing-logo-icon" />
            <span className="landing-logo-text">Intent</span>
          </a>
          <div className="landing-nav-links">
            <a href="#features">{t.features}</a>
            <a href="#how-it-works">{t.howItWorks}</a>
            <a href="#demo">{t.demo}</a>
          </div>
          <div className="landing-nav-actions">
            <div className="landing-lang-selector">
              <button className={lang === "en" ? "active" : ""} onClick={() => onLangChange("en")}>EN</button>
              <button className={lang === "fr" ? "active" : ""} onClick={() => onLangChange("fr")}>FR</button>
              <button className={lang === "es" ? "active" : ""} onClick={() => onLangChange("es")}>ES</button>
              <button className={lang === "de" ? "active" : ""} onClick={() => onLangChange("de")}>DE</button>
            </div>
            {user ? (
              <div className="landing-user-menu">
                <img src={user.avatar} alt={user.login} className="landing-user-avatar" />
                <span>{user.login}</span>
                <button onClick={logout} className="landing-logout-btn">{t.logout}</button>
              </div>
            ) : (
              <button onClick={() => loginWithGitHub("/")} className="landing-login-btn">{t.login}</button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-bg"></div>
        <div className="landing-hero-content">
          <div className="landing-hero-badge">{t.openSource}</div>
          <h1 className="landing-hero-title">
            <span>{t.heroTitle1}</span>
            <span className="landing-gradient-text">{t.heroTitle2}</span>
          </h1>
          <p className="landing-hero-subtitle">{t.heroSubtitle}</p>

          {/* GitHub URL Input */}
          <form className="landing-hero-form" onSubmit={handleSubmit}>
            <div className="landing-input-group">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.inputPlaceholder}
                className="landing-url-input"
                autoFocus
              />
              <button type="submit" className="landing-submit-btn" disabled={!url.trim()}>
                {t.viewIntents}
              </button>
            </div>
            {error && <div className="landing-input-error">{error}</div>}
          </form>

          <div className="landing-hero-options">
            <span>{t.orLocalMode}</span>
            <a href="/local" className="landing-local-link">{t.localMode}</a>
          </div>

          <div className="landing-examples">
            <span>{t.tryExample}</span>
            <button onClick={() => parseAndNavigate("intentcode/intent")}>intentcode/intent</button>
            <button onClick={() => parseAndNavigate("intentcode/intent/tree/main")}>intentcode/intent/tree/main</button>
          </div>
        </div>

        {/* Hero Highlights */}
        <div className="landing-hero-highlights">
          <div className="landing-highlight"><span>⚡</span><span>{t.fastSetup}</span></div>
          <div className="landing-highlight"><span>🔒</span><span>{t.gitNative}</span></div>
          <div className="landing-highlight"><span>🌍</span><span>{t.multilingual}</span></div>
          <div className="landing-highlight"><span>🤖</span><span>{t.aiReady}</span></div>
        </div>

        {/* Scroll Indicator */}
        <button
          className="landing-scroll-indicator"
          onClick={() => {
            document.getElementById("problem")?.scrollIntoView({ behavior: "smooth" });
          }}
          aria-label="Scroll to content"
        >
          <span className="landing-scroll-arrow">↓</span>
        </button>
      </section>

      {/* Problem Section */}
      <section id="problem" className="landing-problem">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2>{t.problemTitle}</h2>
            <p>{t.problemSubtitle}</p>
          </div>
          <div className="landing-problem-grid">
            <div className="landing-problem-card">
              <div className="landing-problem-icon">🤔</div>
              <h3>{t.problem1Title}</h3>
              <p>{t.problem1Desc}</p>
            </div>
            <div className="landing-problem-card">
              <div className="landing-problem-icon">📚</div>
              <h3>{t.problem2Title}</h3>
              <p>{t.problem2Desc}</p>
            </div>
            <div className="landing-problem-card">
              <div className="landing-problem-icon">⏰</div>
              <h3>{t.problem3Title}</h3>
              <p>{t.problem3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="landing-solution">
        <div className="landing-container">
          <div className="landing-solution-content">
            <div className="landing-solution-text">
              <div className="landing-section-badge">{t.solutionBadge}</div>
              <h2>{t.solutionTitle}</h2>
              <p className="landing-solution-desc">{t.solutionDesc}</p>
              <ul className="landing-solution-list">
                <li><span className="landing-check">✓</span><span>{t.solutionCheck1}</span></li>
                <li><span className="landing-check">✓</span><span>{t.solutionCheck2}</span></li>
                <li><span className="landing-check">✓</span><span>{t.solutionCheck3}</span></li>
                <li><span className="landing-check">✓</span><span>{t.solutionCheck4}</span></li>
              </ul>
            </div>
            <div className="landing-solution-visual">
              <div className="landing-code-block">
                <div className="landing-code-header">
                  <span>📄</span>
                  <span>.intent/intents/001-auth.intent.md</span>
                </div>
                <pre className="landing-code-content"><code>{`---
id: user-authentication
author: claude
risk: high
tags: [security, auth]
---

# User Authentication System

## Summary
en: Implements secure login with JWT tokens.
fr: Implémente un login sécurisé avec JWT.

## Chunks

### @function:validate_user | Validation
Validates user credentials against database.

> Decision: Using bcrypt for password hashing`}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2>{t.featuresTitle}</h2>
            <p>{t.featuresSubtitle}</p>
          </div>
          <div className="landing-features-grid">
            <div className="landing-feature-card landing-feature-compare">
              <div className="landing-feature-icon">⚖️</div>
              <h3>{t.compareMode}</h3>
              <p>{t.compareModeDesc}</p>
            </div>
            <div className="landing-feature-card landing-feature-browse">
              <div className="landing-feature-icon">📖</div>
              <h3>{t.browseMode}</h3>
              <p>{t.browseModeDesc}</p>
            </div>
            <div className="landing-feature-card landing-feature-story">
              <div className="landing-feature-icon">📚</div>
              <h3>{t.storyMode}</h3>
              <p>{t.storyModeDesc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="landing-how-it-works">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2>{t.howItWorksTitle}</h2>
            <p>{t.howItWorksSubtitle}</p>
          </div>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-number">1</div>
              <div className="landing-step-content">
                <h3>{t.step1Title}</h3>
                <p>{t.step1Desc}</p>
              </div>
            </div>
            <div className="landing-step">
              <div className="landing-step-number">2</div>
              <div className="landing-step-content">
                <h3>{t.step2Title}</h3>
                <p>{t.step2Desc}</p>
              </div>
            </div>
            <div className="landing-step">
              <div className="landing-step-number">3</div>
              <div className="landing-step-content">
                <h3>{t.step3Title}</h3>
                <p>{t.step3Desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="landing-demo">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2>{t.demoTitle}</h2>
            <p>{t.demoSubtitle}</p>
          </div>
          <div className="landing-demo-cta">
            <p>
              {t.demoExplore}
            </p>
            <button className="landing-demo-btn" onClick={() => parseAndNavigate("intentcode/intent")}>
              intentcode/intent
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-content">
            <div className="landing-footer-logo">
              <img src="/intent_logo.png" alt="Intent" className="landing-logo-icon" />
              <span>Intent</span>
            </div>
            <p className="landing-footer-tagline">{t.footerTagline}</p>
            <div className="landing-footer-links">
              <a href="https://github.com/intentcode/intent" target="_blank" rel="noopener noreferrer">GitHub</a>
              <span>·</span>
              <a href="https://github.com/intentcode/intent#creating-intents" target="_blank" rel="noopener noreferrer">Docs</a>
            </div>
            <p className="landing-footer-credit">{t.builtWith}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
