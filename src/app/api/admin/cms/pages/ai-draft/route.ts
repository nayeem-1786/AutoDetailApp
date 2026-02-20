import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { getPageStyleContext } from '@/lib/utils/ai-page-context';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/pages/ai-draft
// Generate HTML page content using AI
// ---------------------------------------------------------------------------

interface AiDraftRequest {
  prompt: string;
  title: string;
  tone?: 'professional' | 'casual' | 'friendly';
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = (await request.json()) as AiDraftRequest;
  const { prompt, title, tone = 'professional' } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
  }

  const styleContext = getPageStyleContext();

  const toneDesc =
    tone === 'casual'
      ? 'Use a casual, conversational tone.'
      : tone === 'friendly'
        ? 'Use a warm, friendly, and approachable tone.'
        : 'Use a professional, authoritative tone.';

  const systemPrompt = `You are a web content writer for a premium auto detailing and car care business website. Generate HTML page content based on the user's prompt.

${styleContext}

## Additional Instructions
- The page title "${title}" is already rendered as an h1 by the site layout. Do NOT include an h1.
- ${toneDesc}
- Write engaging, informative content appropriate for a premium auto detailing business.
- Structure with clear sections using h2/h3 headings.
- Include relevant calls-to-action where appropriate.
- Output ONLY the HTML content. No markdown, no code fences, no explanation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Generate HTML page content for: ${prompt}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[ai-draft] API error:', res.status, errBody);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    // Strip code fences if AI includes them
    let html = text.trim();
    if (html.startsWith('```html')) {
      html = html.slice(7);
    } else if (html.startsWith('```')) {
      html = html.slice(3);
    }
    if (html.endsWith('```')) {
      html = html.slice(0, -3);
    }
    html = html.trim();

    return NextResponse.json({ html });
  } catch (err) {
    console.error('[ai-draft] Error:', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
