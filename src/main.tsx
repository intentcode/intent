import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { LandingPage } from './components/LandingPage.tsx'
import { initLanguage, setStoredLanguage, type Language } from './lib/language'

function LandingWrapper() {
  const [lang, setLang] = useState<Language>(() => initLanguage());

  const handleLangChange = (newLang: Language) => {
    setLang(newLang);
    setStoredLanguage(newLang);
  };

  return <LandingPage lang={lang} onLangChange={handleLangChange} />;
}

function AppWrapper({ mode }: { mode: "home" | "github-pr" | "github-compare" | "github-browse" }) {
  const [lang, setLang] = useState<Language>(() => initLanguage());

  // Listen for language changes from other components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'intent-lang' && e.newValue) {
        setLang(e.newValue as Language);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLangChange = (newLang: Language) => {
    setLang(newLang);
    setStoredLanguage(newLang);
  };

  return <App mode={mode} lang={lang} onLangChange={handleLangChange} />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingWrapper />,
  },
  {
    path: "/home",
    element: <LandingWrapper />,
  },
  {
    path: "/local",
    element: <AppWrapper mode="home" />,
  },
  {
    path: "/:owner/:repo/pull/:prNumber",
    element: <AppWrapper mode="github-pr" />,
  },
  {
    path: "/:owner/:repo/compare/:base...:head",
    element: <AppWrapper mode="github-compare" />,
  },
  {
    path: "/:owner/:repo/tree/:branch",
    element: <AppWrapper mode="github-browse" />,
  },
  {
    path: "/:owner/:repo",
    element: <AppWrapper mode="github-browse" />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
