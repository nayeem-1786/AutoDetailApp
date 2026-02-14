import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// robots.txt
// GET /robots.txt
// ---------------------------------------------------------------------------

export async function GET() {
  const body = `User-agent: *
Allow: /
Allow: /services
Allow: /products
Allow: /areas
Disallow: /admin
Disallow: /api/
Disallow: /pos
Disallow: /account
Disallow: /login

Sitemap: ${SITE_URL}/sitemap.xml

# AI crawler rules
# See ${SITE_URL}/ai.txt for AI-specific crawler policies
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
