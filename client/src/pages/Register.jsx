import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GoogleIcon from '@/components/GoogleIcon';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  userCategory: z.enum(['student', 'faculty', 'researcher', 'research_assistant', 'lab_technician', 'external', 'others']),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function Register() {
  const navigate = useNavigate();
  const { register: registerUser, isAuthenticated, startOAuth, resendVerificationEmail } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      userCategory: 'student',
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    const result = await registerUser(
      data.email,
      data.password,
      'regular_user',
      data.userCategory
    );

    if (result.success) {
      setSuccess(result.data?.message || 'Registration successful. Check your email for verification, then log in.');
      setRegisteredEmail(data.email);
      form.setValue('password', '');
      form.setValue('confirmPassword', '');
    } else {
      setError(result.error);
    }

    setIsLoading(false);
  };

  const handleOAuth = async (provider) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    const result = await startOAuth(provider);
    if (!result.success) {
      setError(result.error);
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const email = registeredEmail || form.getValues('email');
    if (!email) {
      setError('Enter your email first so we can resend verification.');
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await resendVerificationEmail(email);
    if (result.success) {
      setSuccess(result.message || 'If your email is pending verification, a new link has been sent.');
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent to-transparent" aria-hidden="true" />
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-up-forest-green/10 blur-3xl" aria-hidden="true" />
      <Card className="relative w-full max-w-md border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Register</CardTitle>
          <CardDescription>
            Create a new account to access the PTCF system
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

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="userCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="faculty">Faculty</SelectItem>
                        <SelectItem value="researcher">Researcher</SelectItem>
                        <SelectItem value="research_assistant">Research Assistant</SelectItem>
                        <SelectItem value="lab_technician">Lab Technician</SelectItem>
                        <SelectItem value="external">External</SelectItem>
                        <SelectItem value="others">Others</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}

              {success && (
                <div className="space-y-3">
                  <div className="text-sm text-up-forest-green bg-secondary border border-up-forest-green/20 rounded-md px-3 py-2">
                    {success}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={handleResendVerification}
                  >
                    Resend verification email
                  </Button>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Registering...' : 'Register'}
              </Button>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => handleOAuth('google')}
                  disabled={isLoading}
                >
                  <GoogleIcon />
                  Sign up with Google
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline">
                  Login
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
