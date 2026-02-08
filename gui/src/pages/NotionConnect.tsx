import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '../styles/theme';
import {
  buildNotionAuthUrl,
  exchangeNotionCode,
  parseNotionCallback,
} from '../oauth';
import { configureNotion } from '../api';

const REDIRECT_URI = 'http://localhost:5173/oauth/notion/callback';

export function NotionConnect() {
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
      const savedCredentials = localStorage.getItem('jacques_notion_oauth');
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
      const { code, error: callbackError } = parseNotionCallback(currentUrl);

      if (callbackError) {
        throw new Error(`OAuth error: ${callbackError}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Get credentials from localStorage (saved before redirect)
      const savedCredentials = localStorage.getItem('jacques_notion_oauth');
      if (!savedCredentials) {
        throw new Error('OAuth credentials not found. Please try connecting again.');
      }

      const { client_id, client_secret } = JSON.parse(savedCredentials);

      // Exchange code for tokens
      const tokenResponse = await exchangeNotionCode(code, {
        client_id,
        client_secret,
        redirect_uri: REDIRECT_URI,
      });

      // Save to config via HTTP API
      await configureNotion({
        client_id,
        client_secret,
        tokens: {
          access_token: tokenResponse.access_token,
        },
        workspace_id: tokenResponse.workspace_id,
        workspace_name: tokenResponse.workspace_name,
      });

      // Clean up
      localStorage.removeItem('jacques_notion_oauth');

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
      'jacques_notion_oauth',
      JSON.stringify({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      })
    );

    // Redirect to Notion OAuth
    const authUrl = buildNotionAuthUrl({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      redirect_uri: REDIRECT_URI,
    });

    window.location.href = authUrl;
  };

  if (isCallback && loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Connecting Notion...</h1>
        <p style={styles.description}>Please wait while we complete the authorization.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => navigate('/sources')}>
        ← Back to Sources
      </button>

      <h1 style={styles.title}>Connect Notion</h1>
      <p style={styles.description}>
        Import pages from your Notion workspace into your projects.
      </p>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Setup Instructions</h2>
        <ol style={styles.instructions}>
          <li>
            Go to{' '}
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Notion Integrations
            </a>
          </li>
          <li>Click "New integration"</li>
          <li>
            Choose "Public integration" and fill in the required fields
          </li>
          <li>
            In the OAuth settings, add{' '}
            <code style={styles.code}>{REDIRECT_URI}</code> as a redirect URI
          </li>
          <li>Copy your OAuth Client ID and Client Secret below</li>
        </ol>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Credentials</h2>

        <div style={styles.field}>
          <label style={styles.label}>OAuth Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="your-notion-oauth-client-id"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>OAuth Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="your-notion-oauth-client-secret"
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={styles.connectButton}
          onClick={handleConnect}
          disabled={loading}
        >
          {loading ? 'Connecting...' : 'Connect Notion'}
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
