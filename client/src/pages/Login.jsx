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
  const [sessionNotice, setSessionNotice] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verifiedNotice, setVerifiedNotice] = useState('');

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
    if (logoutReason === 'idle_timeout') {
      setSessionNotice('You were logged out due to 15 minutes of inactivity. Please log in again.');
      clearLogoutReason();
    } else if (logoutReason === 'session_expired') {
      setSessionNotice('Your session expired. Please log in again.');
      clearLogoutReason();
    }
  }, [logoutReason, clearLogoutReason]);

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      setVerifiedNotice('Your email has been verified. Please log in.');
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
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
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  {sessionNotice}
                </div>
              )}
              {verifiedNotice && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  {verifiedNotice}
                </div>
              )}
              {verificationMessage && (
                <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
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
