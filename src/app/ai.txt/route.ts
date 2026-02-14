import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';

// ---------------------------------------------------------------------------
// GET /ai.txt — AI crawler access rules
// Content is admin-configurable via business_settings key 'ai_txt_content'
// ---------------------------------------------------------------------------

const DEFAULT_AI_TXT = `# ai.txt - Smart Details Auto Spa
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

export async function GET() {
  let content = DEFAULT_AI_TXT;

  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'ai_txt_content')
      .maybeSingle();

    if (data?.value && typeof data.value === 'string') {
      content = data.value;
    }
  } catch {
    // Fall back to default on error
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
