import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { getBusinessInfo } from '@/lib/data/business';

// ---------------------------------------------------------------------------
// GET /ai.txt — AI crawler access rules
// Content is admin-configurable via business_settings key 'ai_txt_content'
// ---------------------------------------------------------------------------

function buildDefaultAiTxt(businessName: string) {
  return `# ai.txt - ${businessName}
# This file controls AI crawler access

User-agent: GPTBot
Allow: /
Allow: /services/
Allow: /products/
Allow: /areas/
Disallow: /admin/
Disallow: /api/
Disallow: /pos/
Disallow: /account/
Disallow: /login

User-agent: Google-Extended
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: CCBot
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: anthropic-ai
Allow: /
Disallow: /admin/
Disallow: /api/
`;
}

export async function GET() {
  let content: string | null = null;

  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'ai_txt_content')
      .maybeSingle();

    // Defensive unwrap for any legacy double-encoded row left by the pre-fix
    // PATCH handler (see migration 2026XXXX_normalize_ai_txt_content_double_encoding.sql
    // and docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md). For clean post-fix
    // rows this branch is a no-op (multi-line ai.txt body isn't valid JSON,
    // JSON.parse throws, raw value is used).
    if (data?.value && typeof data.value === 'string') {
      const raw = data.value;
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        try {
          const unwrapped = JSON.parse(raw);
          content = typeof unwrapped === 'string' ? unwrapped : raw;
        } catch {
          content = raw;
        }
      } else {
        content = raw;
      }
    }
  } catch {
    // Fall back to default on error
  }

  if (!content) {
    const biz = await getBusinessInfo();
    content = buildDefaultAiTxt(biz.name);
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
