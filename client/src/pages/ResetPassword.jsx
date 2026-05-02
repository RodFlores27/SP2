import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

function getRecoveryAccessToken() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get('access_token') || queryParams.get('access_token') || '';
}

export default function ResetPassword() {
  const recoveryToken = useMemo(() => getRecoveryAccessToken(), []);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      await axiosInstance.post(
        '/auth/password',
        { password: data.password },
        {
          headers: { Authorization: `Bearer ${recoveryToken}` },
          skipAuthRedirect: true,
        }
      );
      setSuccess('Password updated successfully. You can now log in with your new password.');
      form.reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update password');
    } finally {
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
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>
            Use the recovery link from your email to choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!recoveryToken ? (
            <div className="space-y-4">
              <div className="text-sm text-accent-foreground bg-accent border border-up-gold/30 rounded-md px-3 py-2">
                This reset link does not include a recovery token. Request a fresh password reset email and open the latest link.
              </div>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request another reset link</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm new password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && <div className="text-sm text-destructive">{error}</div>}
                {success && (
                  <div className="text-sm text-up-forest-green bg-secondary border border-up-forest-green/20 rounded-md px-3 py-2">
                    {success}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Updating...' : 'Update password'}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  <Link to="/login" className="text-primary hover:underline">
                    Back to login
                  </Link>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
