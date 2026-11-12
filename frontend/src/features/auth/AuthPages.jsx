import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { emailSchema, passwordPolicySchema, orgCodeSchema } from '../../lib/schemas.js';
import { getFriendlyErrorMessage, applyServerFieldErrors } from '../../lib/errors.js';
import { Button, FormField } from '../../components/shared.jsx';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      const res = await authApi.login(values);
      setSession({ user: res.user, accessToken: res.access_token });
      if (res.user.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(searchParams.get('next') || '/', { replace: true });
      }
    } catch (err) {
      setServerError(getFriendlyErrorMessage(err));
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface-muted">
      <div className="bg-surface border border-line rounded-card shadow-card p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="w-10 h-10 rounded-input bg-brand-600 text-white font-bold flex items-center justify-center mx-auto mb-3">
            E
          </div>
          <h1 className="text-2xl font-bold text-ink-900">Sign in to ESG Platform</h1>
          <p className="text-sm text-ink-500 mt-1">Collect → Verify → Approve → Measure → Report</p>
        </div>

        {serverError ? (
          <div
            role="alert"
            aria-live="polite"
            className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-input p-3"
          >
            {serverError}
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField label="Email" required error={errors.email?.message}>
            {(fieldProps) => (
              <input
                {...fieldProps}
                {...register('email')}
                type="email"
                autoComplete="email"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
                placeholder="you@company.com"
              />
            )}
          </FormField>

          <FormField label="Password" required error={errors.password?.message}>
            {(fieldProps) => (
              <div className="relative">
                <input
                  {...fieldProps}
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full border border-line rounded-input px-3 py-2 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-ink-500 hover:text-ink-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}
          </FormField>

          <div className="flex items-center justify-between text-xs">
            <Link to="/forgot-password" className="text-brand-600 hover:underline font-medium">
              Forgot password?
            </Link>
            <Link to="/register" className="text-brand-600 hover:underline font-medium">
              Register organisation
            </Link>
          </div>

          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}

const registerSchema = z
  .object({
    organization_name: z.string().trim().min(1, 'Organisation name is required').max(200),
    organization_code: orgCodeSchema,
    display_name: z.string().trim().min(1, 'Your name is required').max(150),
    email: emailSchema,
    password: passwordPolicySchema,
    confirm_password: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

export function RegisterOrgPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      organization_name: '',
      organization_code: '',
      display_name: '',
      email: '',
      password: '',
      confirm_password: '',
    },
  });

  const pwd = watch('password') || '';
  const checks = [
    { label: '10+ chars', ok: pwd.length >= 10 },
    { label: 'Uppercase', ok: /[A-Z]/.test(pwd) },
    { label: 'Lowercase', ok: /[a-z]/.test(pwd) },
    { label: 'Digit', ok: /[0-9]/.test(pwd) },
  ];

  const onSubmit = async (values) => {
    try {
      await authApi.registerOrganization({
        organization_name: values.organization_name,
        organization_code: values.organization_code.toUpperCase(),
        display_name: values.display_name,
        email: values.email,
        password: values.password,
      });
      toast.success('Organisation registered! Please sign in.');
      navigate('/login');
    } catch (err) {
      if (!applyServerFieldErrors(err, setError)) {
        toast.error(getFriendlyErrorMessage(err));
      }
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface-muted">
      <div className="bg-surface border border-line rounded-card shadow-card p-8 max-w-lg w-full space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Register Organisation</h1>
          <p className="text-sm text-ink-500 mt-1">
            Creates your organisation workspace and your initial Admin account.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField label="Organisation Name" required error={errors.organization_name?.message}>
            {(props) => (
              <input
                {...props}
                {...register('organization_name')}
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
                placeholder="Acme Sustainability Ltd."
              />
            )}
          </FormField>

          <FormField
            label="Organisation Code"
            required
            hint="2–50 uppercase letters, digits, _ or - (e.g. ACME)"
            error={errors.organization_code?.message}
          >
            {(props) => (
              <input
                {...props}
                {...register('organization_code')}
                className="w-full border border-line rounded-input px-3 py-2 text-sm uppercase"
                placeholder="ACME"
              />
            )}
          </FormField>

          <FormField label="Your Name (Admin)" required error={errors.display_name?.message}>
            {(props) => (
              <input
                {...props}
                {...register('display_name')}
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
                placeholder="Asha Sharma"
              />
            )}
          </FormField>

          <FormField label="Admin Email" required error={errors.email?.message}>
            {(props) => (
              <input
                {...props}
                {...register('email')}
                type="email"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
                placeholder="asha@acme.com"
              />
            )}
          </FormField>

          <FormField label="Password" required error={errors.password?.message}>
            {(props) => (
              <input
                {...props}
                {...register('password')}
                type="password"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
              />
            )}
          </FormField>

          <div className="grid grid-cols-4 gap-1.5 text-[11px]">
            {checks.map((c) => (
              <span
                key={c.label}
                className={
                  c.ok
                    ? 'bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium text-center'
                    : 'bg-gray-100 text-ink-500 px-2 py-0.5 rounded text-center'
                }
              >
                {c.label}
              </span>
            ))}
          </div>

          <FormField label="Confirm Password" required error={errors.confirm_password?.message}>
            {(props) => (
              <input
                {...props}
                {...register('confirm_password')}
                type="password"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
              />
            )}
          </FormField>

          <Button type="submit" loading={isSubmitting} className="w-full">
            Create Organisation & Admin Account
          </Button>
        </form>

        <p className="text-xs text-center text-ink-500">
          Already registered?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(z.object({ email: emailSchema })),
  });

  const onSubmit = async (values) => {
    try {
      await authApi.forgotPassword(values);
      setSent(true);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface-muted">
      <div className="bg-surface border border-line rounded-card shadow-card p-8 max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold text-ink-900">Reset your password</h1>
        {sent ? (
          <div className="space-y-4 text-sm text-ink-500">
            <p>If an active account exists for that email, a 30-minute reset link has been sent.</p>
            <Link to="/login" className="text-brand-600 font-medium hover:underline inline-block">
              Return to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField label="Email" required error={errors.email?.message}>
              {(props) => (
                <input
                  {...props}
                  {...register('email')}
                  type="email"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Send reset link
            </Button>
            <Link to="/login" className="block text-center text-xs text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const schema = z
    .object({
      new_password: passwordPolicySchema,
      confirm_password: z.string().min(1),
    })
    .refine((d) => d.new_password === d.confirm_password, {
      path: ['confirm_password'],
      message: 'Passwords do not match',
    });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    try {
      await authApi.resetPassword({ token, new_password: values.new_password });
      toast.success('Password updated. Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface-muted">
      <div className="bg-surface border border-line rounded-card shadow-card p-8 max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold text-ink-900">Choose a new password</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField label="New Password" required error={errors.new_password?.message}>
            {(props) => (
              <input
                {...props}
                {...register('new_password')}
                type="password"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
              />
            )}
          </FormField>
          <FormField label="Confirm Password" required error={errors.confirm_password?.message}>
            {(props) => (
              <input
                {...props}
                {...register('confirm_password')}
                type="password"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
              />
            )}
          </FormField>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Save new password
          </Button>
        </form>
      </div>
    </main>
  );
}

const changePwdSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordPolicySchema,
    confirm_password: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

export function ChangePasswordPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(changePwdSchema) });

  const onSubmit = async (values) => {
    try {
      await authApi.changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      if (user) setUser({ ...user, must_change_password: false });
      reset();
      toast.success('Password changed successfully.');
      navigate('/');
    } catch (err) {
      if (!applyServerFieldErrors(err, setError)) {
        toast.error(getFriendlyErrorMessage(err));
      }
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Change Password</h1>
      {user?.must_change_password ? (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium p-3 rounded-input"
        >
          You signed in with a temporary password. Please set a new password to continue.
        </div>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label="Current Password" required error={errors.current_password?.message}>
          {(props) => (
            <input
              {...props}
              {...register('current_password')}
              type="password"
              className="w-full border border-line rounded-input px-3 py-2 text-sm"
            />
          )}
        </FormField>
        <FormField
          label="New Password"
          required
          hint="10+ characters with uppercase, lowercase, and digit"
          error={errors.new_password?.message}
        >
          {(props) => (
            <input
              {...props}
              {...register('new_password')}
              type="password"
              className="w-full border border-line rounded-input px-3 py-2 text-sm"
            />
          )}
        </FormField>
        <FormField label="Confirm New Password" required error={errors.confirm_password?.message}>
          {(props) => (
            <input
              {...props}
              {...register('confirm_password')}
              type="password"
              className="w-full border border-line rounded-input px-3 py-2 text-sm"
            />
          )}
        </FormField>
        <Button type="submit" loading={isSubmitting}>
          Update Password
        </Button>
      </form>
    </div>
  );
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-600">My Profile</h1>
      <div className="bg-surface border border-line rounded-card shadow-card p-6 grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-xs text-ink-500 uppercase font-semibold">Name</span>
          <p className="font-semibold text-ink-900 mt-0.5">{user?.display_name}</p>
        </div>
        <div>
          <span className="text-xs text-ink-500 uppercase font-semibold">Email</span>
          <p className="font-semibold text-ink-900 mt-0.5">{user?.email}</p>
        </div>
        <div>
          <span className="text-xs text-ink-500 uppercase font-semibold">Organisation</span>
          <p className="font-semibold text-ink-900 mt-0.5">
            {user?.organization?.organization_name} ({user?.organization?.organization_code})
          </p>
        </div>
        <div>
          <span className="text-xs text-ink-500 uppercase font-semibold">Department</span>
          <p className="font-semibold text-ink-900 mt-0.5">
            {user?.department ? user.department.department_name : '—'}
          </p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-xs text-ink-500 uppercase font-semibold">Active Roles</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(user?.roles || []).map((r) => (
              <span
                key={r}
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ChangePasswordPage />
    </div>
  );
}

