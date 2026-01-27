import type { TranslateFunction, AuthInfo } from '../../types';

interface ErrorStateProps {
  error: string | null;
  authInfo: AuthInfo | null;
  onRetry?: () => void;
  t: TranslateFunction;
  lang: string;
}

// Helper to get localized string
const localize = (obj: Record<string, string> | undefined, lang: string): string => {
  if (!obj) return '';
  return obj[lang] || obj['en'] || Object.values(obj)[0] || '';
};

// Provider icon components
const ProviderIcon = ({ icon, size = 20 }: { icon?: 'github' | 'gitlab' | 'default'; size?: number }) => {
  if (icon === 'github') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    );
  }
  if (icon === 'gitlab') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
      </svg>
    );
  }
  // Default icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );
};

/**
 * Provider-agnostic error states: auth required, app install required, general error
 * Works with GitHub, GitLab, or any other provider
 */
export function ErrorState({
  error,
  authInfo,
  onRetry,
  t,
  lang
}: ErrorStateProps) {
  // Auth required error - show login prompt
  if (authInfo?.needsAuth && error) {
    return (
      <div className="auth-required-banner">
        <div className="auth-required-icon">🔒</div>
        <div className="auth-required-content">
          <div className="auth-required-title">
            {lang === "fr" ? "Authentification requise" : "Authentication Required"}
          </div>
          <div className="auth-required-desc">
            {localize(authInfo.loginDesc, lang)}
          </div>
        </div>
        <button
          onClick={authInfo.loginAction}
          className="auth-required-btn"
        >
          <ProviderIcon icon={authInfo.providerIcon} />
          <span>{localize(authInfo.loginLabel, lang)}</span>
        </button>
      </div>
    );
  }

  // Provider app not installed error - show install prompt
  if (authInfo?.installError) {
    const { installError } = authInfo;
    return (
      <div className="install-required-banner">
        <div className="install-required-icon">
          <ProviderIcon icon={installError.icon} size={48} />
        </div>
        <div className="install-required-content">
          <div className="install-required-title">
            {localize(installError.title, lang)}
          </div>
          <div className="install-required-desc">
            {installError.message}
          </div>
          {installError.hint && (
            <div className="install-required-hint">
              {localize(installError.hint, lang)}
            </div>
          )}
        </div>
        <a
          href={installError.actionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="install-required-btn"
        >
          <ProviderIcon icon={installError.icon} />
          <span>{localize(installError.actionLabel, lang)}</span>
        </a>
      </div>
    );
  }

  // General error
  if (error) {
    return (
      <div className="error-banner">
        <div className="error-icon">😵</div>
        <div className="error-title">{t("errorTitle")}</div>
        <div className="error-message">{t("errorMessage")}</div>
        <div className="error-details">{error}</div>
        {onRetry && (
          <button
            className="error-retry-btn"
            onClick={onRetry}
          >
            {t("retry")}
          </button>
        )}
      </div>
    );
  }

  return null;
}
