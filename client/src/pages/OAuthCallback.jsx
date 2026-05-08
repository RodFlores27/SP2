import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRoleHomePath } from '@/lib/role-home';

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
      navigate(getRoleHomePath(result.user), { replace: true });
    };
    finish();
    return () => {
      cancelled = true;
    };
  }, [completeOAuth, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent to-transparent" aria-hidden="true" />
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-up-forest-green/10 blur-3xl" aria-hidden="true" />
      <Card className="relative w-full max-w-md border-primary/10 shadow-lg">
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
