import { createAdminClient } from '@/lib/supabase/admin';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[bytes[i] % CHARS.length];
  }
  return code;
}

/**
 * Create a short link for a target URL.
 * Returns the full short URL (e.g. https://domain.com/s/Ab3kXz).
 */
export async function createShortLink(targetUrl: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const supabase = createAdminClient();

  // Retry up to 3 times in case of code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from('short_links')
      .insert({ code, target_url: targetUrl });

    if (!error) {
      return `${appUrl}/s/${code}`;
    }

    // If it's not a unique violation, throw immediately
    if (!error.message?.includes('unique') && !error.code?.includes('23505')) {
      throw new Error(`Failed to create short link: ${error.message}`);
    }
  }

  // Fallback: return the original URL if short link creation fails
  console.error('Failed to generate unique short link code after 3 attempts');
  return targetUrl;
}
