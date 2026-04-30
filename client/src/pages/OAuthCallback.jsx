import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function parseOAuthTokensFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const accessToken = hash.get('access_token') || query.get('access_token') || '';
  const refreshToken = hash.get('refresh_token') || query.get('refresh_token') || '';
  return { accessToken, refreshToken };
}

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const finish = async () => {
      const { accessToken, refreshToken } = parseOAuthTokensFromUrl();
      if (!accessToken) {
        if (!cancelled) setError('OAuth callback is missing access token');
        return;
      }

      const result = await completeOAuth(accessToken, refreshToken);
      if (cancelled) return;
      if (!result.success) {
        setError(result.error || 'Unable to complete OAuth sign-in');
        return;
      }
      navigate('/dashboard', { replace: true });
    };
    finish();
    return () => {
      cancelled = true;
    };
  }, [completeOAuth, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Completing sign-in</CardTitle>
          <CardDescription>
            We are finishing your OAuth login and syncing your profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <div className="text-sm text-muted-foreground">Please wait...</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
