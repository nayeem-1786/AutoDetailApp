'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { normalizePhone } from '@/lib/utils/format';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';
import { useCustomerLink } from './useCustomerLink';

export interface VerifyResult {
  userId: string;
  phone: string;
  customerLinked: boolean;
  isNewOtpSignup: boolean;
}

export interface UsePhoneOtpOptions {
  mode: 'sign-in' | 'sign-up';
  onBeforeSend?: (phone: string, e164: string) => Promise<{ abort: boolean; error?: string }>;
  onVerified: (result: VerifyResult) => void | Promise<void>;
  onNoCustomerFound?: (phone: string) => void;
}

export interface UsePhoneOtpReturn {
  phase: 'phone' | 'otp';
  loading: boolean;
  error: string | null;
  cooldown: number;
  otpPhone: string;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  resetError: () => void;
  resetToPhone: () => void;
}

export function usePhoneOtp(options: UsePhoneOtpOptions): UsePhoneOtpReturn {
  const { mode, onBeforeSend, onVerified, onNoCustomerFound } = options;
  const [phase, setPhase] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpPhone, setOtpPhone] = useState('');
  const { linkByPhone } = useCustomerLink();

  // Store latest callbacks in refs to avoid stale closure issues
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const onNoCustomerFoundRef = useRef(onNoCustomerFound);
  onNoCustomerFoundRef.current = onNoCustomerFound;

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = useCallback(
    async (phone: string) => {
      setLoading(true);
      setError(null);

      const e164 = normalizePhone(phone);
      if (!e164) {
        setError(AUTH_ERRORS.PHONE_INVALID);
        setLoading(false);
        return;
      }

      // Pre-send callback (e.g., check-exists for sign-in or sign-up)
      if (onBeforeSend) {
        const result = await onBeforeSend(phone, e164);
        if (result.abort) {
          setError(result.error || null);
          setLoading(false);
          return;
        }
      }

      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

      if (otpError) {
        if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
          setError(AUTH_ERRORS.OTP_RATE_LIMITED);
        } else {
          setError(AUTH_ERRORS.OTP_SEND_FAILED);
        }
        setLoading(false);
        return;
      }

      setOtpPhone(phone);
      setCooldown(60);
      setPhase('otp');
      setLoading(false);
    },
    [onBeforeSend]
  );

  const verifyOtp = useCallback(
    async (phone: string, code: string) => {
      setLoading(true);
      setError(null);

      const e164 = normalizePhone(phone);
      if (!e164) {
        setError(AUTH_ERRORS.PHONE_INVALID);
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: e164,
          token: code,
          type: 'sms',
        });

        if (verifyError) {
          if (verifyError.message.includes('expired')) {
            setError(AUTH_ERRORS.OTP_EXPIRED);
          } else if (
            verifyError.message.includes('invalid') ||
            verifyError.message.includes('incorrect')
          ) {
            setError(AUTH_ERRORS.OTP_INVALID);
          } else if (
            verifyError.message.includes('rate') ||
            verifyError.message.includes('too many')
          ) {
            setError(AUTH_ERRORS.OTP_RATE_LIMITED);
          } else {
            setError(AUTH_ERRORS.OTP_VERIFY_FAILED);
          }
          return;
        }

        // Staff guard
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError(AUTH_ERRORS.OTP_VERIFY_FAILED);
          return;
        }

        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (emp) {
          await supabase.auth.signOut();
          setError(AUTH_ERRORS.STAFF_PHONE);
          return;
        }

        // Check for existing customer record
        const { data: cust } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .eq('auth_user_id', user.id)
          .single();

        if (mode === 'sign-in') {
          if (cust) {
            // Customer found — sign-in complete
            await onVerifiedRef.current({
              userId: user.id,
              phone: e164,
              customerLinked: true,
              isNewOtpSignup: false,
            });
          } else {
            // Try to link by phone
            const linkResult = await linkByPhone(e164);

            if (linkResult.success) {
              await onVerifiedRef.current({
                userId: user.id,
                phone: e164,
                customerLinked: true,
                isNewOtpSignup: false,
              });
            } else if (linkResult.error === 'ALREADY_LINKED') {
              await supabase.auth.signOut();
              setError(AUTH_ERRORS.PHONE_ALREADY_LINKED);
            } else if (linkResult.error === 'NOT_FOUND') {
              // No customer record at all — delegate to consumer
              if (onNoCustomerFoundRef.current) {
                onNoCustomerFoundRef.current(phone);
              } else {
                setError(AUTH_ERRORS.PHONE_NOT_FOUND);
              }
            } else {
              setError(AUTH_ERRORS.LINK_FAILED);
            }
          }
        } else {
          // sign-up mode
          await onVerifiedRef.current({
            userId: user.id,
            phone: e164,
            customerLinked: !!cust,
            isNewOtpSignup: !cust,
          });
        }
      } catch (err) {
        console.error('OTP verification error:', err);
        setError(AUTH_ERRORS.OTP_VERIFY_FAILED);
      } finally {
        setLoading(false);
      }
    },
    [mode, linkByPhone]
  );

  const resendOtp = useCallback(async () => {
    if (cooldown > 0) return;
    setError(null);

    const e164 = normalizePhone(otpPhone);
    if (!e164) return;

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setError(AUTH_ERRORS.OTP_RATE_LIMITED);
      } else {
        setError(AUTH_ERRORS.OTP_SEND_FAILED);
      }
      return;
    }

    setCooldown(60);
  }, [cooldown, otpPhone]);

  const resetError = useCallback(() => setError(null), []);

  const resetToPhone = useCallback(() => {
    setPhase('phone');
    setError(null);
    setOtpPhone('');
  }, []);

  return {
    phase,
    loading,
    error,
    cooldown,
    otpPhone,
    sendOtp,
    verifyOtp,
    resendOtp,
    resetError,
    resetToPhone,
  };
}
