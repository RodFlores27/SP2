import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import GoogleIcon from '@/components/GoogleIcon';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

function getSessionNotice(reason) {
  if (reason === 'idle_timeout') {
    return 'You were logged out due to 15 minutes of inactivity. Please log in again.';
  }
  if (reason === 'session_expired') {
    return 'Your session expired. Please log in again.';
  }
  return '';
}

function getVerifiedNotice(params) {
  return params.get('verified') === '1'
    ? 'Your email has been verified. Please log in.'
    : '';
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    login,
    isAuthenticated,
    logoutReason,
    clearLogoutReason,
    resendVerificationEmail,
    startOAuth,
  } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionNotice] = useState(() => getSessionNotice(logoutReason));
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verifiedNotice, setVerifiedNotice] = useState(() => getVerifiedNotice(searchParams));

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (getSessionNotice(logoutReason)) {
      clearLogoutReason();
    }
  }, [logoutReason, clearLogoutReason]);

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('verified');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    setVerificationMessage('');
    setVerifiedNotice('');

    const result = await login(data.email, data.password);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
      if (/not confirmed|verify/i.test(result.error || '')) {
        setVerificationMessage('Need a new verification link? Use the button below.');
      }
      // Clear only the password field, keep email intact
      form.setValue('password', '');
    }

    setIsLoading(false);
  };

  const handleResendVerification = async () => {
    const email = form.getValues('email');
    if (!email) {
      setError('Enter your email first so we can resend verification.');
      return;
    }
    setIsLoading(true);
    const result = await resendVerificationEmail(email);
    if (result.success) {
      setVerificationMessage(
        result.message || 'If your email is pending verification, a new link has been sent.'
      );
      setError('');
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  };

  const handleOAuth = async (provider) => {
    setError('');
    setVerificationMessage('');
    setVerifiedNotice('');
    setIsLoading(true);
    const result = await startOAuth(provider);
    if (!result.success) {
      setError(result.error);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent to-transparent" aria-hidden="true" />
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-up-forest-green/10 blur-3xl" aria-hidden="true" />
      <Card className="relative w-full max-w-md border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
          <Link
            to="/guidelines"
            className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Read the reservation guidelines
          </Link>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="student@uplb.edu.ph"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}
              {sessionNotice && (
                <div className="text-sm text-accent-foreground bg-accent border border-up-gold/30 rounded-md px-3 py-2">
                  {sessionNotice}
                </div>
              )}
              {verifiedNotice && (
                <div className="text-sm text-up-forest-green bg-secondary border border-up-forest-green/20 rounded-md px-3 py-2">
                  {verifiedNotice}
                </div>
              )}
              {verificationMessage && (
                <div className="text-sm text-up-forest-green bg-secondary border border-up-forest-green/20 rounded-md px-3 py-2">
                  {verificationMessage}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
              {verificationMessage && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isLoading}
                  onClick={handleResendVerification}
                >
                  Resend verification email
                </Button>
              )}

              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => handleOAuth('google')}
                  disabled={isLoading}
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
              </div>

              <div className="text-center text-sm">
                <Link to="/forgot-password" className="text-primary hover:underline">
                  Forgot your password?
                </Link>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary hover:underline">
                  Register
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
