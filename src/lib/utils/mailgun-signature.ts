import crypto from 'crypto';

/**
 * Verify Mailgun webhook signature using HMAC-SHA256.
 *
 * Mailgun sends: { timestamp, token, signature } in the `signature` object.
 * We compute HMAC-SHA256(signingKey, timestamp + token) and compare to signature.
 *
 * @param signingKey - Mailgun webhook signing key (from MAILGUN_WEBHOOK_SIGNING_KEY env var)
 * @param timestamp - Unix timestamp string from webhook payload
 * @param token - Random token string from webhook payload
 * @param signature - HMAC hex digest from webhook payload
 * @returns true if signature is valid
 */
export function verifyMailgunWebhook(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const encodedToken = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp.concat(token))
    .digest('hex');

  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(encodedToken),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
