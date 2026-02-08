import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '../styles/theme';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
  parseGoogleCallback,
} from '../oauth';
import { configureGoogleDocs } from '../api';

const REDIRECT_URI = 'http://localhost:5173/oauth/google/callback';

export function GoogleDocsConnect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCallback, setIsCallback] = useState(false);

  // Check if this is an OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (code || errorParam) {
      setIsCallback(true);
      handleCallback();
    } else {
      // Load saved credentials from localStorage if any
      loadSavedCredentials();
    }
  }, [searchParams]);

  const loadSavedCredentials = () => {
    try {
      const savedCredentials = localStorage.getItem('jacques_google_oauth');
      if (savedCredentials) {
        const { client_id, client_secret } = JSON.parse(savedCredentials);
        if (client_id) setClientId(client_id);
        if (client_secret) setClientSecret(client_secret);
      }
    } catch (error) {
      console.error('Failed to load saved credentials:', error);
    }
  };

  const handleCallback = async () => {
    setLoading(true);
    setError(null);

    try {
      const currentUrl = window.location.href;
      const { code, error: callbackError } = parseGoogleCallback(currentUrl);

      if (callbackError) {
        throw new Error(`OAuth error: ${callbackError}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Get credentials from localStorage (saved before redirect)
      const savedCredentials = localStorage.getItem('jacques_google_oauth');
      if (!savedCredentials) {
        throw new Error('OAuth credentials not found. Please try connecting again.');
      }

      const { client_id, client_secret } = JSON.parse(savedCredentials);

      // Exchange code for tokens
      const tokens = await exchangeGoogleCode(code, {
        client_id,
        client_secret,
        redirect_uri: REDIRECT_URI,
      });

      // Get user info
      const userInfo = await getGoogleUserInfo(tokens.access_token);

      // Save to config via HTTP API
      await configureGoogleDocs({
        client_id,
        client_secret,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + tokens.expires_in * 1000,
        },
        connected_email: userInfo.email,
      });

      // Clean up
      localStorage.removeItem('jacques_google_oauth');

      // Redirect to sources page
      navigate('/sources');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed');
      setIsCallback(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }

    // Save credentials for callback
    localStorage.setItem(
      'jacques_google_oauth',
      JSON.stringify({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      })
    );

    // Redirect to Google OAuth
    const authUrl = buildGoogleAuthUrl({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      redirect_uri: REDIRECT_URI,
    });

    window.location.href = authUrl;
  };

  if (isCallback && loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Connecting Google Docs...</h1>
        <p style={styles.description}>Please wait while we complete the authorization.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => navigate('/sources')}>
        ← Back to Sources
      </button>

      <h1 style={styles.title}>Connect Google Docs</h1>
      <p style={styles.description}>
        Import documents from your Google Drive into your projects.
      </p>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Setup Instructions</h2>
        <ol style={styles.instructions}>
          <li>
            Go to the{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Google Cloud Console
            </a>
          </li>
          <li>Create a new project or select an existing one</li>
          <li>Enable the Google Drive API</li>
          <li>Create OAuth 2.0 credentials (Web application type)</li>
          <li>
            Add <code style={styles.code}>{REDIRECT_URI}</code> as an authorized
            redirect URI
          </li>
          <li>Copy your Client ID and Client Secret below</li>
        </ol>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Credentials</h2>

        <div style={styles.field}>
          <label style={styles.label}>Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="your-client-id.apps.googleusercontent.com"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="your-client-secret"
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={styles.connectButton}
          onClick={handleConnect}
          disabled={loading}
        >
          {loading ? 'Connecting...' : 'Connect Google Docs'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '600px',
  },
  backButton: {
    fontSize: '13px',
    color: colors.textSecondary,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: colors.textSecondary,
    marginBottom: '24px',
  },
  section: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    padding: '20px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 500,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: '16px',
  },
  instructions: {
    color: colors.textSecondary,
    fontSize: '14px',
    lineHeight: 1.8,
    paddingLeft: '20px',
    margin: 0,
  },
  link: {
    color: colors.accent,
  },
  code: {
    backgroundColor: colors.bgInput,
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    color: colors.textSecondary,
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    color: colors.textPrimary,
    boxSizing: 'border-box' as const,
  },
  error: {
    color: colors.danger,
    fontSize: '13px',
    marginBottom: '16px',
    padding: '10px',
    backgroundColor: `${colors.danger}20`,
    borderRadius: '6px',
  },
  connectButton: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: colors.accent,
    color: colors.textPrimary,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
