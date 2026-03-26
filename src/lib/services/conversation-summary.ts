import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate an AI-powered conversation summary for cross-session memory.
 * Uses Claude Haiku for cost efficiency. Produces a structured summary
 * that persists key facts (customer intent, vehicle info, quotes, outcome)
 * so the AI auto-responder has context across multi-day conversations.
 */

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer for an auto detailing business.
Given a conversation thread between a customer and the business (via SMS or AI assistant), produce a concise structured summary.

Output ONLY this format (omit sections with no data):

Customer: [name if known]
Vehicle: [year make model color (size class) if discussed]
Interest: [services or products discussed]
Quotes: [quote numbers and status if any were sent]
Outcome: [booked / quoted / interested / lost / resolved / pending]
Key Facts: [any important context — preferences, concerns, timeline]
Next Steps: [what the customer said they'd do next, or pending follow-ups]

Rules:
- Be factual — only include what was actually discussed
- Keep each line under 100 characters
- If a section has no data, omit it entirely
- Focus on actionable context that helps the next conversation
- Capture specific vehicle details, service names, and pricing discussed
- Note any commitments made by either party`;

export async function generateConversationSummary(
  conversationId: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ConvSummary] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const admin = createAdminClient();

  // Fetch all messages for the conversation (not just last 30)
  const { data: messages, error } = await admin
    .from('messages')
    .select('direction, body, sender_type, created_at')
    .eq('conversation_id', conversationId)
    .neq('sender_type', 'system')
    .order('created_at', { ascending: true });

  if (error || !messages || messages.length < 3) {
    // Not enough messages to summarize
    return null;
  }

  // Build conversation text
  const conversationText = messages.map((m) => {
    const role = m.direction === 'inbound' ? 'Customer' : (m.sender_type === 'ai' ? 'AI Assistant' : 'Staff');
    return `[${role}]: ${m.body}`;
  }).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'unable to read body');
      console.error('[ConvSummary] Anthropic API error:', response.status, errBody);
      return null;
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text?.trim();

    if (!summary) {
      console.error('[ConvSummary] Empty summary response');
      return null;
    }

    // Store summary on conversation
    const now = new Date().toISOString();
    await admin
      .from('conversations')
      .update({ summary, summary_updated_at: now })
      .eq('id', conversationId);

    console.log(`[ConvSummary] Generated summary for conversation ${conversationId} (${messages.length} messages)`);
    return summary;
  } catch (err) {
    console.error('[ConvSummary] Generation failed:', err);
    return null;
  }
}
