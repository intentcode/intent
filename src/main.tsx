import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { LandingPage } from './components/LandingPage.tsx'

function LandingWrapper() {
  const [lang, setLang] = useState<"en" | "fr">("en");
  return <LandingPage lang={lang} onLangChange={setLang} />;
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
    element: <App mode="home" />,
  },
  {
    path: "/:owner/:repo/pull/:prNumber",
    element: <App mode="github-pr" />,
  },
  {
    path: "/:owner/:repo/compare/:base...:head",
    element: <App mode="github-compare" />,
  },
  {
    path: "/:owner/:repo/tree/:branch",
    element: <App mode="github-browse" />,
  },
  {
    path: "/:owner/:repo",
    element: <App mode="github-browse" />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
