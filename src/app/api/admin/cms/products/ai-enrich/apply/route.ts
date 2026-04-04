import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { specsSchema } from '@/lib/utils/validation';

interface ApplyAction {
  draftId: string;
  action: 'apply' | 'reject';
  applyDescription?: boolean;
  applySpecs?: boolean;
  specOverrides?: Record<string, unknown>;
}

/**
 * POST /api/admin/cms/products/ai-enrich/apply
 * Apply or reject reviewed enrichment drafts.
 */
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { actions } = body as { actions: ApplyAction[] };

  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ error: 'actions array is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  let applied = 0;
  let rejected = 0;
  const errors: Array<{ draftId: string; error: string }> = [];

  for (const action of actions) {
    if (action.action === 'reject') {
      const { error } = await admin
        .from('product_enrichment_drafts')
        .update({ status: 'rejected' })
        .eq('id', action.draftId);
      if (error) {
        errors.push({ draftId: action.draftId, error: error.message });
      } else {
        rejected++;
      }
      continue;
    }

    // action === 'apply'
    // Fetch the draft
    const { data: draft, error: fetchErr } = await admin
      .from('product_enrichment_drafts')
      .select('id, product_id, short_description, specs')
      .eq('id', action.draftId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !draft) {
      errors.push({ draftId: action.draftId, error: fetchErr?.message ?? 'Draft not found or not pending' });
      continue;
    }

    const updates: Record<string, unknown> = {};

    // Apply short description
    if (action.applyDescription && draft.short_description) {
      updates.description = draft.short_description;
    }

    // Apply specs
    if (action.applySpecs && draft.specs) {
      // Merge draft specs with any overrides
      const draftSpecs = (draft.specs as Record<string, unknown>) ?? {};
      const merged = { ...draftSpecs, ...(action.specOverrides ?? {}) };

      // Strip empty/null fields
      const cleaned = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => {
          if (v === null || v === undefined || v === '') return false;
          if (Array.isArray(v) && v.length === 0) return false;
          return true;
        })
      );

      // Validate against specsSchema
      const validated = specsSchema.safeParse(cleaned);
      if (validated.success) {
        updates.specs = Object.keys(validated.data ?? {}).length > 0 ? validated.data : null;
      } else {
        // Use cleaned version without strict validation (partial data is OK)
        updates.specs = Object.keys(cleaned).length > 0 ? cleaned : null;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await admin
        .from('products')
        .update(updates)
        .eq('id', draft.product_id);

      if (updateErr) {
        errors.push({ draftId: action.draftId, error: updateErr.message });
        continue;
      }
    }

    // Mark draft as applied
    const { error: statusErr } = await admin
      .from('product_enrichment_drafts')
      .update({ status: 'applied' })
      .eq('id', action.draftId);

    if (statusErr) {
      errors.push({ draftId: action.draftId, error: statusErr.message });
    } else {
      applied++;
    }
  }

  return NextResponse.json({ applied, rejected, errors: errors.length > 0 ? errors : undefined });
}
