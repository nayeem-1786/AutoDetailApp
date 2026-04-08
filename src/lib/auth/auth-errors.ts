export const AUTH_ERRORS = {
  PHONE_INVALID: 'Please enter a valid 10-digit phone number.',
  OTP_EXPIRED: 'Your verification code has expired. Please request a new one.',
  OTP_INVALID: "That code didn\u2019t work. Please check and try again, or request a new code.",
  OTP_RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  OTP_SEND_FAILED: 'Something went wrong sending your code. Please try again.',
  OTP_VERIFY_FAILED: 'Something went wrong verifying your code. Please try again.',
  STAFF_PHONE: 'This phone number is linked to a staff account.',
  STAFF_EMAIL: 'This email is linked to a staff account.',
  PHONE_NOT_FOUND: 'PHONE_NOT_FOUND',
  PHONE_ALREADY_LINKED: 'This phone number is already linked to another account.',
  EMAIL_ALREADY_LINKED: 'This email is already linked to another account.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  SIGNIN_RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  SIGNIN_FAILED: 'Something went wrong signing you in. Please try again.',
  LINK_FAILED: 'Something went wrong linking your account. Please try again.',
  SESSION_EXPIRED: 'Your session has expired. Please try again.',
  NO_CUSTOMER: 'NO_CUSTOMER',
  GENERIC: 'Something went wrong. Please try again.',
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERRORS;
export type AuthErrorValue = (typeof AUTH_ERRORS)[AuthErrorKey];
