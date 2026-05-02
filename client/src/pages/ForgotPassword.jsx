import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export default function ForgotPassword() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const response = await axiosInstance.post('/auth/password-reset-request', {
        email: data.email,
        redirectTo,
      });
      setSuccess(response.data?.message || 'If that email is registered, a password reset link will be sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to request password reset');
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
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your account email and we will send a Supabase reset link.
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
                      <Input type="email" placeholder="student@uplb.edu.ph" {...field} />
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
                {isLoading ? 'Sending...' : 'Send reset link'}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                Remembered your password?{' '}
                <Link to="/login" className="text-primary hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
