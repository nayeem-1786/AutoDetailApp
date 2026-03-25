import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateConversationSummary } from '@/lib/services/conversation-summary';

const CRON_API_KEY = process.env.CRON_API_KEY;
const MAX_PER_RUN = 10;
const MIN_MESSAGES_FOR_SUMMARY = 5;
const COOLDOWN_HOURS = 1; // Don't summarize conversations with activity in the last hour

/**
 * Conversation summary cron — runs every 6 hours.
 * Finds active conversations with enough new messages since last summary
 * and generates AI summaries for cross-session memory.
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

    // Find conversations that need summarization:
    // 1. Status is open or closed (not archived)
    // 2. Last message is older than cooldown (not actively being used)
    // 3. Either: no summary exists, or summary is stale (new messages since last summary)
    const { data: candidates, error } = await admin
      .from('conversations')
      .select('id, last_message_at, summary_updated_at')
      .in('status', ['open', 'closed'])
      .lt('last_message_at', cooldownCutoff)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[ConvSummary Cron] Query error:', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Filter to conversations that need summarization
    const needsSummary = (candidates || []).filter((c) => {
      // No summary at all
      if (!c.summary_updated_at) return true;
      // Summary is older than last message (new messages since last summary)
      if (c.last_message_at && c.summary_updated_at < c.last_message_at) return true;
      return false;
    });

    // Further filter: only conversations with enough messages since last summary
    const toProcess: string[] = [];
    for (const conv of needsSummary) {
      if (toProcess.length >= MAX_PER_RUN) break;

      const sinceFilter = conv.summary_updated_at || '1970-01-01T00:00:00Z';
      const { count } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .gt('created_at', sinceFilter)
        .neq('sender_type', 'system');

      if ((count ?? 0) >= MIN_MESSAGES_FOR_SUMMARY) {
        toProcess.push(conv.id);
      }
    }

    if (toProcess.length === 0) {
      return NextResponse.json({ data: { processed: 0, message: 'No conversations need summarization' } });
    }

    // Generate summaries
    let successCount = 0;
    let failCount = 0;

    for (const convId of toProcess) {
      try {
        const summary = await generateConversationSummary(convId);
        if (summary) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(`[ConvSummary Cron] Failed for ${convId}:`, err);
        failCount++;
      }

      // Small delay between API calls to avoid rate limits
      if (toProcess.indexOf(convId) < toProcess.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(`[ConvSummary Cron] Processed ${successCount} summaries, ${failCount} failures`);

    return NextResponse.json({
      data: {
        processed: successCount,
        failed: failCount,
        total_candidates: needsSummary.length,
      },
    });
  } catch (err) {
    console.error('[ConvSummary Cron] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
