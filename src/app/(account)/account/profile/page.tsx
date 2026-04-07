'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerProfileSchema, type CustomerProfileInput } from '@/lib/utils/validation';
import { formatPhoneInput, formatPhone } from '@/lib/utils/format';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { customerSignOut } from '@/lib/auth/customer-signout';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Info, ShieldCheck, Mail } from 'lucide-react';

type EmailState = 'none' | 'verified' | 'editing' | 'otp';

export default function AccountProfilePage() {
  const router = useRouter();
  const { customer, user, refreshCustomer } = useCustomerAuth();
  const [saving, setSaving] = useState(false);

  // Auth provider detection
  const providers = user?.app_metadata?.providers as string[] | undefined;
  const isEmailAuthUser =
    user?.app_metadata?.provider === 'email' ||
    (Array.isArray(providers) && providers.includes('email'));

  // Email verification state
  const [emailState, setEmailState] = useState<EmailState>('none');
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [removingEmail, setRemovingEmail] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Confirmation dialog states
  const [confirmSmsOff, setConfirmSmsOff] = useState(false);
  const [confirmEmailOff, setConfirmEmailOff] = useState(false);
  const [confirmPromotionsOff, setConfirmPromotionsOff] = useState(false);
  const [confirmLoyaltyOff, setConfirmLoyaltyOff] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CustomerProfileInput>({
    resolver: formResolver(customerProfileSchema),
    values: customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone ? formatPhone(customer.phone) : '',
          sms_consent: customer.sms_consent,
          email_consent: customer.email_consent,
          notify_promotions: customer.notify_promotions ?? true,
          notify_loyalty: customer.notify_loyalty ?? true,
        }
      : undefined,
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');
  const notifyPromotions = watch('notify_promotions');
  const notifyLoyalty = watch('notify_loyalty');

  // Initialize email state from customer data
  useEffect(() => {
    if (!customer) return;
    if (customer.email && customer.email_verified_at) {
      setEmailState('verified');
    } else if (customer.email && !customer.email_verified_at) {
      // Unverified email — show as editable
      setEmailState('none');
      setEmailInput(customer.email);
    } else {
      setEmailState('none');
    }
  }, [customer]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // OTP auto-focus with triple-rAF + 300ms fallback (matches inline-auth.tsx pattern)
  useEffect(() => {
    if (emailState === 'otp') {
      const tryFocus = () => otpInputRef.current?.focus();
      requestAnimationFrame(() => {
        tryFocus();
        requestAnimationFrame(() => {
          tryFocus();
        });
      });
      const timer = setTimeout(tryFocus, 300);
      return () => clearTimeout(timer);
    }
  }, [emailState]);

  const sendVerificationCode = useCallback(async (emailToVerify: string) => {
    setEmailLoading(true);
    setEmailError('');

    try {
      const res = await fetch('/api/customer/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToVerify }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'Failed to send verification code');
        setEmailLoading(false);
        return false;
      }

      setPendingEmail(emailToVerify);
      setOtpCode('');
      setResendCooldown(60);
      setEmailState('otp');
      setEmailLoading(false);
      return true;
    } catch {
      setEmailError('Something went wrong. Please try again.');
      setEmailLoading(false);
      return false;
    }
  }, []);

  const handleAddEmail = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }
    await sendVerificationCode(trimmed);
  };

  const handleVerifyCode = async () => {
    if (otpCode.length !== 6) {
      setEmailError('Enter the 6-digit code');
      return;
    }

    setEmailLoading(true);
    setEmailError('');

    try {
      const res = await fetch('/api/customer/email/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code: otpCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'Verification failed');
        setEmailLoading(false);
        return;
      }

      toast.success('Email verified');
      await refreshCustomer();
      setEmailState('verified');
      setOtpCode('');
      setEmailError('');
    } catch {
      setEmailError('Something went wrong. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    await sendVerificationCode(pendingEmail);
  };

  const handleRemoveEmail = async () => {
    setRemovingEmail(true);
    try {
      const res = await fetch('/api/customer/email', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to remove email');
        return;
      }

      toast.success('Email removed');
      await refreshCustomer();
      setEmailState('none');
      setEmailInput('');
    } catch {
      toast.error('Failed to remove email');
    } finally {
      setRemovingEmail(false);
      setConfirmRemoveEmail(false);
    }
  };

  const handleChangeEmail = () => {
    setEmailInput('');
    setEmailError('');
    setOtpCode('');
    setEmailState('editing');
  };

  const handleCancelOtp = () => {
    setOtpCode('');
    setEmailError('');
    if (customer?.email && customer?.email_verified_at) {
      setEmailState('verified');
    } else {
      setEmailState('none');
    }
  };

  if (!customer) return null;

  const onSubmit = async (data: CustomerProfileInput) => {
    setSaving(true);

    const res = await fetch('/api/customer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok) {
      toast.error(result.error || 'Failed to save profile');
      setSaving(false);
      return;
    }

    toast.success('Profile updated');
    setSaving(false);
  };

  // Toggle handlers with confirmation
  const handleSmsToggle = (checked: boolean) => {
    if (!checked && smsConsent) {
      setConfirmSmsOff(true);
    } else {
      setValue('sms_consent', checked, { shouldDirty: true });
    }
  };

  const handleEmailToggle = (checked: boolean) => {
    if (!checked && emailConsent) {
      setConfirmEmailOff(true);
    } else {
      setValue('email_consent', checked, { shouldDirty: true });
    }
  };

  const handlePromotionsToggle = (checked: boolean) => {
    if (!checked && notifyPromotions) {
      setConfirmPromotionsOff(true);
    } else {
      setValue('notify_promotions', checked, { shouldDirty: true });
    }
  };

  const handleLoyaltyToggle = (checked: boolean) => {
    if (!checked && notifyLoyalty) {
      setConfirmLoyaltyOff(true);
    } else {
      setValue('notify_loyalty', checked, { shouldDirty: true });
    }
  };

  const handleSignOutAllDevices = async () => {
    setSigningOut(true);
    try {
      toast.success('Signed out of all devices');
      await customerSignOut({ scope: 'global' });
    } catch {
      toast.error('Failed to sign out');
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  };

  const handleChangePassword = async () => {
    if (!customer.email) {
      toast.error('No email address on file');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(customer.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/signin/reset-password`,
      });

      if (error) throw error;
      toast.success('Password reset email sent. Check your inbox.');
    } catch {
      toast.error('Failed to send password reset email');
    }
  };

  // Render email section based on state
  const renderEmailSection = () => {
    // State C: OTP verification
    if (emailState === 'otp') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-site-text">
            Enter the 6-digit code sent to <strong className="text-accent-brand">{pendingEmail}</strong>
          </p>
          <Input
            ref={otpInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={otpCode}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setOtpCode(val);
              setEmailError('');
            }}
            className="text-center text-lg tracking-[0.3em] text-base sm:text-sm max-w-[200px]"
          />
          {emailError && (
            <p className="text-sm text-red-400">{emailError}</p>
          )}
          <div className="flex items-center gap-4">
            <Button
              type="button"
              size="sm"
              onClick={handleVerifyCode}
              disabled={emailLoading || otpCode.length !== 6}
            >
              {emailLoading ? 'Verifying...' : 'Verify'}
            </Button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0}
              className="text-sm text-site-text-muted hover:text-site-text disabled:text-site-text-faint"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={handleCancelOtp}
              className="text-sm text-site-text-muted hover:text-site-text"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // State B: Verified email on file
    if (emailState === 'verified' && customer.email) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-site-text">{customer.email}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleChangeEmail}
              className="text-sm text-accent-brand hover:text-accent-brand-hover"
            >
              Change Email
            </button>
            {!isEmailAuthUser && (
              <button
                type="button"
                onClick={() => setConfirmRemoveEmail(true)}
                disabled={removingEmail}
                className="text-sm text-site-text-muted hover:text-red-400"
              >
                Remove Email
              </button>
            )}
          </div>
        </div>
      );
    }

    // State A: No email / editing
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            className="text-base sm:text-sm flex-1"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailError('');
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAddEmail}
            disabled={emailLoading || !emailInput.trim()}
          >
            {emailLoading ? 'Sending...' : emailState === 'editing' ? 'Verify' : 'Add Email'}
          </Button>
        </div>
        {emailError && (
          <p className="text-sm text-red-400">{emailError}</p>
        )}
        {emailState === 'editing' && (
          <button
            type="button"
            onClick={handleCancelOtp}
            className="text-sm text-site-text-muted hover:text-site-text"
          >
            Cancel
          </button>
        )}
        <p className="text-xs text-site-text-dim">
          {emailState === 'editing'
            ? 'Enter your new email address. We\'ll send a verification code.'
            : 'Add an email for booking confirmations and receipts'}
        </p>
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-site-text">Profile</h1>
      <p className="mt-1 text-sm text-site-text-faint">
        Manage your account settings and preferences.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
        {/* Card 1: Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your basic contact details. We use this to reach you about your appointments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First Name" required error={errors.first_name?.message} htmlFor="first_name">
                <Input id="first_name" {...register('first_name')} />
              </FormField>

              <FormField label="Last Name" required error={errors.last_name?.message} htmlFor="last_name">
                <Input id="last_name" {...register('last_name')} />
              </FormField>
            </div>

            {/* Email section — separate from main form, uses verification flow */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-site-text flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-site-text-muted" />
                Email
              </label>
              {renderEmailSection()}
            </div>

            <FormField
              label="Mobile"
              required
              error={errors.phone?.message}
              htmlFor="phone"
            >
              <Input
                id="phone"
                placeholder="(310) 555-1234"
                {...register('phone', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const formatted = formatPhoneInput(e.target.value);
                    setValue('phone', formatted, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  },
                })}
              />
              <p className="mt-1 text-xs text-site-text-dim">
                We&apos;ll text you appointment reminders and updates.
              </p>
            </FormField>
          </CardContent>
        </Card>

        {/* Card 2: Communication Channels */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Communication Channels</CardTitle>
                <CardDescription>
                  Choose how you&apos;d like to receive messages from us.
                </CardDescription>
              </div>
              <div className="group relative">
                <Info className="h-5 w-5 text-site-text-muted cursor-help" />
                <div className="absolute right-0 top-6 z-10 hidden w-64 rounded-lg border border-site-border bg-brand-surface p-3 text-xs text-site-text-faint shadow-lg group-hover:block">
                  Turning off a channel means you won&apos;t receive any messages through it, including important appointment reminders.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-site-border p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Text Messages (SMS)</p>
                <p className="text-xs text-site-text-dim">
                  Get appointment reminders and updates via text
                </p>
              </div>
              <Switch
                checked={smsConsent ?? false}
                onCheckedChange={handleSmsToggle}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-site-border p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Email</p>
                <p className="text-xs text-site-text-dim">
                  Get receipts, confirmations, and updates via email
                </p>
              </div>
              <Switch
                checked={emailConsent ?? false}
                onCheckedChange={handleEmailToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Notification Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Control what types of messages you receive.
                </CardDescription>
              </div>
              <div className="group relative">
                <Info className="h-5 w-5 text-site-text-muted cursor-help" />
                <div className="absolute right-0 top-6 z-10 hidden w-64 rounded-lg border border-site-border bg-brand-surface p-3 text-xs text-site-text-faint shadow-lg group-hover:block">
                  Some notifications are required to keep you informed about your appointments. Optional notifications can be turned off anytime.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Required notifications */}
            <div className="flex items-center justify-between rounded-lg border border-site-border bg-brand-surface p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Appointment Reminders</p>
                <p className="text-xs text-site-text-dim">
                  Booking confirmations and upcoming appointment reminders
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-site-border px-2 py-0.5 text-xs text-site-text-faint">Required</span>
                <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-site-border bg-brand-surface p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Service Updates</p>
                <p className="text-xs text-site-text-dim">
                  Status updates when your vehicle is being serviced
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-site-border px-2 py-0.5 text-xs text-site-text-faint">Required</span>
                <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
              </div>
            </div>

            {/* Optional notifications */}
            <div className="flex items-center justify-between rounded-lg border border-site-border p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Promotions & Special Offers</p>
                <p className="text-xs text-site-text-dim">
                  Exclusive discounts and seasonal deals just for you
                </p>
              </div>
              <Switch
                checked={notifyPromotions ?? true}
                onCheckedChange={handlePromotionsToggle}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-site-border p-4">
              <div>
                <p className="text-sm font-medium text-site-text">Loyalty Rewards</p>
                <p className="text-xs text-site-text-dim">
                  Points earned, reward milestones, and bonus opportunities
                </p>
              </div>
              <Switch
                checked={notifyLoyalty ?? true}
                onCheckedChange={handleLoyaltyToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !isDirty}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Card 4: Account Security (outside form) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Account Security</CardTitle>
          <CardDescription>
            Manage your password and sign-in sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleChangePassword}>
              Change Password
            </Button>
            <Button
              variant="outline"
              className="text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => setConfirmSignOut(true)}
            >
              Sign Out All Devices
            </Button>
          </div>
          <p className="mt-3 text-xs text-site-text-dim">
            Signing out all devices will log you out everywhere, including this browser. You&apos;ll need to sign in again.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmSmsOff}
        onOpenChange={setConfirmSmsOff}
        title="Turn Off Text Messages?"
        description="You won't receive any text messages from us, including appointment reminders and service updates. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('sms_consent', false, { shouldDirty: true });
          setConfirmSmsOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmEmailOff}
        onOpenChange={setConfirmEmailOff}
        title="Turn Off Email?"
        description="You won't receive any emails from us, including receipts, confirmations, and appointment reminders. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('email_consent', false, { shouldDirty: true });
          setConfirmEmailOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmPromotionsOff}
        onOpenChange={setConfirmPromotionsOff}
        title="Turn Off Promotions?"
        description="You'll miss out on exclusive discounts, special offers, and seasonal deals. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('notify_promotions', false, { shouldDirty: true });
          setConfirmPromotionsOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmLoyaltyOff}
        onOpenChange={setConfirmLoyaltyOff}
        title="Turn Off Loyalty Updates?"
        description="You won't be notified when you earn points, reach reward milestones, or unlock bonus opportunities. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('notify_loyalty', false, { shouldDirty: true });
          setConfirmLoyaltyOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign Out All Devices?"
        description="This will sign you out of every device where you're currently logged in, including this one. You'll need to sign in again to continue."
        confirmLabel="Sign Out Everywhere"
        variant="destructive"
        loading={signingOut}
        onConfirm={handleSignOutAllDevices}
      />

      <ConfirmDialog
        open={confirmRemoveEmail}
        onOpenChange={setConfirmRemoveEmail}
        title="Remove Email?"
        description="You'll stop receiving email receipts, booking confirmations, and other email communications. You can add a new email anytime."
        confirmLabel="Remove"
        variant="destructive"
        loading={removingEmail}
        onConfirm={handleRemoveEmail}
      />
    </div>
  );
}
