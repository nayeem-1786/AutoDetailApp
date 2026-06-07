import { SupabaseClient } from '@supabase/supabase-js';
import { generateQuoteNumber } from '@/lib/utils/quote-number';
import { TAX_RATE } from '@/lib/utils/constants';
import {
  resolveMobileFields,
  MobileFieldsError,
  type MobileFieldsInput,
  type ResolvedMobileFields,
} from '@/lib/utils/resolve-mobile-fields';
import { resolveManualDiscountAmount } from './manual-discount';
import type { CreateQuoteInput, UpdateQuoteInput } from '@/lib/utils/validation';
import type { QuoteSource } from './source-labels';
import { attachTierMetaToItems } from './attach-tier-meta';

// ---------------------------------------------------------------------------
// Shared select strings
// ---------------------------------------------------------------------------

const QUOTE_LIST_SELECT = `
  *,
  customer:customers(id, first_name, last_name, phone, email),
  vehicle:vehicles(id, year, make, model),
  items:quote_items(*)
`;

const QUOTE_DETAIL_SELECT = `
  *,
  customer:customers(id, first_name, last_name, phone, email, address_line_1, address_line_2, city, state, zip, loyalty_points_balance),
  vehicle:vehicles(id, year, make, model, color, vehicle_type, size_class),
  items:quote_items(*)
`;

// ---------------------------------------------------------------------------
// listQuotes
// ---------------------------------------------------------------------------

interface ListQuotesOptions {
  status?: string | null;
  customerId?: string | null;
  search?: string | null;
  page?: number;
  limit?: number;
  searchIncludesPhone?: boolean;
}

interface ListQuotesResult {
  quotes: unknown[];
  total: number;
  page: number;
  limit: number;
}

export async function listQuotes(
  supabase: SupabaseClient,
  options: ListQuotesOptions = {}
): Promise<ListQuotesResult> {
  const {
    status,
    customerId,
    search,
    page = 1,
    limit = 20,
    searchIncludesPhone = false,
  } = options;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('quotes')
    .select(QUOTE_LIST_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  if (search) {
    query = query.or(`quote_number.ilike.%${search}%`);
  }

  const { data: quotes, error, count } = await query;

  if (error) {
    console.error('Error fetching quotes:', error.message);
    throw new Error('Failed to fetch quotes');
  }

  // Post-fetch filter for customer name (and optionally phone) search
  let filtered = quotes || [];
  if (search && filtered.length > 0) {
    const q = search.toLowerCase();
    filtered = filtered.filter((quote) => {
      const matchesNumber = quote.quote_number?.toLowerCase().includes(q);
      const cust = quote.customer as { first_name?: string; last_name?: string; phone?: string } | null;
      const matchesName = cust
        ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.toLowerCase().includes(q)
        : false;
      const matchesPhone = searchIncludesPhone ? (cust?.phone?.includes(q) ?? false) : false;
      return matchesNumber || matchesName || matchesPhone;
    });
  }

  return {
    quotes: filtered,
    total: search ? filtered.length : (count ?? 0),
    page,
    limit,
  };
}

// ---------------------------------------------------------------------------
// createQuote
// ---------------------------------------------------------------------------

interface CreateQuoteResult {
  quote: unknown;
}

export async function createQuote(
  supabase: SupabaseClient,
  data: CreateQuoteInput,
  source: QuoteSource,
  createdBy?: string | null
): Promise<CreateQuoteResult> {
  const quoteNumber = await generateQuoteNumber(supabase);

  // Resolve mobile fields server-side. Zone path re-fetches mobile_zones and
  // verifies the client-supplied surcharge; Custom path trusts authenticated
  // staff input within bounds.
  const mobileResolved = await resolveMobileForQuote(supabase, data);

  // Generate short access token for public quote link (6 chars, 56.8B combos)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const accessToken = Array.from(bytes, (b) => chars[b % chars.length]).join('');

  // Item 15g Layer 15g-ii — modifier snapshot. Coherence is enforced at
  // the DB layer via the quotes_manual_discount_coherent +
  // quotes_loyalty_coherent CHECK constraints; the helpers below collapse
  // partial state to fully-null so we don't trip the constraints on a
  // payload that supplied only one half of a pair.
  const manualDiscount = normalizeManualDiscount(data);
  const loyalty = normalizeLoyaltyRedemption(data);

  // Item 15g Layer 15g-v — total_amount is now net of all modifiers.
  // Computed via the canonical `computeQuoteTotals` helper so writer +
  // converter + in-memory reducer all produce the same number.
  const { subtotal, taxAmount, totalAmount } = computeQuoteTotals({
    items: data.items,
    mobileSurcharge: mobileResolved.surcharge,
    couponDiscount: data.coupon_discount ?? null,
    loyaltyDiscount: loyalty.discount,
    manualDiscountType: manualDiscount.type,
    manualDiscountValue: manualDiscount.value,
  });

  const insertPayload: Record<string, unknown> = {
    quote_number: quoteNumber,
    customer_id: data.customer_id,
    vehicle_id: data.vehicle_id || null,
    status: data.status || 'draft',
    source,
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    notes: data.notes || null,
    valid_until: data.valid_until || null,
    access_token: accessToken,
    coupon_code: data.coupon_code || null,
    coupon_discount: data.coupon_discount ?? null,
    loyalty_points_to_redeem: loyalty.points,
    loyalty_discount: loyalty.discount,
    manual_discount_type: manualDiscount.type,
    manual_discount_value: manualDiscount.value,
    manual_discount_label: manualDiscount.label,
    is_mobile: mobileResolved.isMobile,
    mobile_zone_id: mobileResolved.zoneId,
    mobile_address: mobileResolved.address,
    mobile_surcharge: mobileResolved.surcharge,
    mobile_zone_name_snapshot: mobileResolved.snapshotName,
  };

  if (createdBy) {
    insertPayload.created_by = createdBy;
  }

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert(insertPayload)
    .select('*')
    .single();

  if (quoteError || !quote) {
    console.error('Error creating quote:', quoteError?.message);
    throw new Error('Failed to create quote');
  }

  const quoteItems = data.items.map((item) => ({
    quote_id: quote.id,
    service_id: item.service_id || null,
    product_id: item.product_id || null,
    item_name: item.item_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
    tier_name: item.tier_name || null,
    standard_price: item.standard_price ?? null,
    pricing_type: item.pricing_type ?? null,
    notes: item.notes || null,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('quote_items')
    .insert(quoteItems)
    .select('*');

  if (itemsError) {
    console.error('Error creating quote items:', itemsError.message);
    // Clean up the quote if items failed
    await supabase.from('quotes').delete().eq('id', quote.id);
    throw new Error('Failed to create quote items');
  }

  const createdQuote = { ...quote, items: insertedItems };

  return { quote: createdQuote };
}

// ---------------------------------------------------------------------------
// getQuoteById
// ---------------------------------------------------------------------------

export async function getQuoteById(
  supabase: SupabaseClient,
  quoteId: string
): Promise<unknown | null> {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select(QUOTE_DETAIL_SELECT)
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (error || !quote) {
    return null;
  }

  // D46 (Issue 41): merge service_pricing.tier_label / qty_label onto each
  // quote_item so the admin + POS quote detail surfaces, slide-over, and
  // any other consumer of `getQuoteById` can render `renderTierToken`
  // without inlining a batched lookup at each call site. Best-effort —
  // failures inside the helper are logged and items pass through
  // unchanged so quote detail remains viewable.
  const q = quote as {
    items?: Array<Record<string, unknown> & {
      service_id?: string | null;
      tier_name?: string | null;
    }>;
  };
  if (Array.isArray(q.items) && q.items.length > 0) {
    q.items = await attachTierMetaToItems(supabase, q.items);
  }

  return quote;
}

// ---------------------------------------------------------------------------
// updateQuote
// ---------------------------------------------------------------------------

export async function updateQuote(
  supabase: SupabaseClient,
  quoteId: string,
  data: UpdateQuoteInput
): Promise<unknown> {
  // Fetch current quote to verify existence
  const { data: current, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !current) {
    throw new QuoteNotFoundError();
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.customer_id !== undefined) update.customer_id = data.customer_id;
  if (data.vehicle_id !== undefined) update.vehicle_id = data.vehicle_id;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.valid_until !== undefined) update.valid_until = data.valid_until;
  if (data.status !== undefined) update.status = data.status;
  if (data.coupon_code !== undefined) update.coupon_code = data.coupon_code || null;

  // Item 15g Layer 15g-ii — modifier snapshot. Update keys are written only
  // when the corresponding payload field was supplied (undefined = "no
  // intent to change"); explicit null clears the column. Coherence is
  // enforced at the DB layer.
  const couponDiscountChanged = data.coupon_discount !== undefined;
  if (couponDiscountChanged) {
    update.coupon_discount = data.coupon_discount ?? null;
  }

  const manualDiscountChanged =
    data.manual_discount_type !== undefined ||
    data.manual_discount_value !== undefined ||
    data.manual_discount_label !== undefined;
  let manualDiscountResolved: ReturnType<typeof normalizeManualDiscount> | null = null;
  if (manualDiscountChanged) {
    manualDiscountResolved = normalizeManualDiscount(data);
    update.manual_discount_type = manualDiscountResolved.type;
    update.manual_discount_value = manualDiscountResolved.value;
    update.manual_discount_label = manualDiscountResolved.label;
  }

  const loyaltyChanged =
    data.loyalty_points_to_redeem !== undefined ||
    data.loyalty_discount !== undefined;
  let loyaltyResolved: ReturnType<typeof normalizeLoyaltyRedemption> | null = null;
  if (loyaltyChanged) {
    loyaltyResolved = normalizeLoyaltyRedemption(data);
    update.loyalty_points_to_redeem = loyaltyResolved.points;
    update.loyalty_discount = loyaltyResolved.discount;
  }

  // Mobile fields: resolve via the same helper as createQuote so server-side
  // validation runs identically. Only patch the columns when the caller
  // signaled mobile state in this update (is_mobile field present in body).
  const hasMobileUpdate = data.is_mobile !== undefined;
  let mobileResolved: ResolvedMobileFields | null = null;
  if (hasMobileUpdate) {
    mobileResolved = await resolveMobileForQuote(supabase, data);
    update.is_mobile = mobileResolved.isMobile;
    update.mobile_zone_id = mobileResolved.zoneId;
    update.mobile_address = mobileResolved.address;
    update.mobile_surcharge = mobileResolved.surcharge;
    update.mobile_zone_name_snapshot = mobileResolved.snapshotName;
  }

  // Item 15g Layer 15g-v — recompute `total_amount` whenever ANY input that
  // affects the canonical formula changes: items, coupon discount, loyalty
  // discount, manual discount, or mobile surcharge. Previously the recompute
  // only fired when items were supplied — leaving modifier-only PATCHes
  // (the dominant edit path now that 15g-ii hashes modifiers in the
  // auto-save) writing stale totals. When the PATCH doesn't supply items
  // (or modifier values), we fetch the current persisted state and merge.
  const hasItemsUpdate = !!(data.items && data.items.length > 0);
  const needsTotalsRecompute =
    hasItemsUpdate ||
    hasMobileUpdate ||
    couponDiscountChanged ||
    manualDiscountChanged ||
    loyaltyChanged;

  if (needsTotalsRecompute) {
    // Resolve the effective inputs to the totals formula. Anything not
    // supplied in this PATCH falls back to the persisted state. We only
    // skip the fetch when the PATCH carries every input the formula needs
    // (items + mobile + all three modifiers) — the rare full-replacement
    // case.
    const needExistingFetch = !(
      hasItemsUpdate &&
      hasMobileUpdate &&
      couponDiscountChanged &&
      manualDiscountChanged &&
      loyaltyChanged
    );

    interface ExistingRowShape {
      mobile_surcharge?: number | string | null;
      coupon_discount?: number | string | null;
      loyalty_discount?: number | string | null;
      manual_discount_type?: 'dollar' | 'percent' | null;
      manual_discount_value?: number | string | null;
      items?: Array<{
        quantity: number;
        unit_price: number;
        product_id: string | null;
      }>;
    }
    let existingRow: ExistingRowShape | null = null;
    if (needExistingFetch) {
      const { data: existing } = await supabase
        .from('quotes')
        .select(
          'mobile_surcharge, coupon_discount, loyalty_discount, manual_discount_type, manual_discount_value, items:quote_items(quantity, unit_price, product_id)'
        )
        .eq('id', quoteId)
        .is('deleted_at', null)
        .single();
      existingRow = (existing as ExistingRowShape | null) ?? null;
    }

    const effectiveItems = hasItemsUpdate
      ? data.items!
      : (existingRow?.items ?? []);
    const effectiveSurcharge = hasMobileUpdate
      ? (mobileResolved?.surcharge ?? 0)
      : Number(existingRow?.mobile_surcharge ?? 0);
    const effectiveCouponDiscount = couponDiscountChanged
      ? (data.coupon_discount ?? null)
      : (existingRow?.coupon_discount != null
          ? Number(existingRow.coupon_discount)
          : null);
    const effectiveLoyaltyDiscount = loyaltyChanged
      ? (loyaltyResolved?.discount ?? null)
      : (existingRow?.loyalty_discount != null
          ? Number(existingRow.loyalty_discount)
          : null);
    const effectiveManualType = manualDiscountChanged
      ? (manualDiscountResolved?.type ?? null)
      : (existingRow?.manual_discount_type ?? null);
    const effectiveManualValue = manualDiscountChanged
      ? (manualDiscountResolved?.value ?? null)
      : (existingRow?.manual_discount_value != null
          ? Number(existingRow.manual_discount_value)
          : null);

    const totals = computeQuoteTotals({
      items: effectiveItems,
      mobileSurcharge: effectiveSurcharge,
      couponDiscount: effectiveCouponDiscount,
      loyaltyDiscount: effectiveLoyaltyDiscount,
      manualDiscountType: effectiveManualType,
      manualDiscountValue: effectiveManualValue,
    });

    update.subtotal = totals.subtotal;
    update.tax_amount = totals.taxAmount;
    update.total_amount = totals.totalAmount;
  }

  // Items: delete existing + re-insert when supplied. Separate from the
  // totals recompute above so a modifier-only PATCH doesn't touch the
  // quote_items table.
  if (hasItemsUpdate) {
    const { error: deleteErr } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', quoteId);

    if (deleteErr) {
      console.error('Error deleting quote items:', deleteErr.message);
      throw new Error('Failed to update quote items');
    }

    const newItems = data.items!.map((item) => ({
      quote_id: quoteId,
      service_id: item.service_id || null,
      product_id: item.product_id || null,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
      tier_name: item.tier_name || null,
      standard_price: item.standard_price ?? null,
      pricing_type: item.pricing_type ?? null,
      notes: item.notes || null,
    }));

    const { error: insertErr } = await supabase
      .from('quote_items')
      .insert(newItems);

    if (insertErr) {
      console.error('Error inserting quote items:', insertErr.message);
      throw new Error('Failed to insert quote items');
    }
  }

  // Update quote and return with relations
  const { data: updated, error: updateErr } = await supabase
    .from('quotes')
    .update(update)
    .eq('id', quoteId)
    .select(QUOTE_LIST_SELECT)
    .single();

  if (updateErr) {
    console.error('Quote update failed:', updateErr.message);
    throw new Error('Failed to update quote');
  }

  return updated;
}

// ---------------------------------------------------------------------------
// softDeleteQuote
// ---------------------------------------------------------------------------

export async function softDeleteQuote(
  supabase: SupabaseClient,
  quoteId: string
): Promise<void> {
  // Fetch current quote to check status
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !quote) {
    throw new QuoteNotFoundError();
  }

  if (quote.status !== 'draft') {
    throw new QuoteDraftOnlyError();
  }

  // Soft-delete: set deleted_at timestamp
  const { error: deleteErr } = await supabase
    .from('quotes')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', quoteId);

  if (deleteErr) {
    console.error('Quote delete failed:', deleteErr.message);
    throw new Error('Failed to delete quote');
  }
}

// ---------------------------------------------------------------------------
// getQuotePipelineStats
// ---------------------------------------------------------------------------

interface PipelineStat {
  status: string;
  count: number;
  totalAmount: number;
}

export async function getQuotePipelineStats(
  supabase: SupabaseClient
): Promise<PipelineStat[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('status, total_amount')
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching pipeline stats:', error.message);
    throw new Error('Failed to fetch pipeline stats');
  }

  const grouped = new Map<string, { count: number; totalAmount: number }>();

  for (const row of data || []) {
    const existing = grouped.get(row.status);
    if (existing) {
      existing.count += 1;
      existing.totalAmount += row.total_amount ?? 0;
    } else {
      grouped.set(row.status, { count: 1, totalAmount: row.total_amount ?? 0 });
    }
  }

  return Array.from(grouped.entries()).map(([status, agg]) => ({
    status,
    count: agg.count,
    totalAmount: Math.round(agg.totalAmount * 100) / 100,
  }));
}

// ---------------------------------------------------------------------------
// getQuoteMetrics
// ---------------------------------------------------------------------------

interface QuoteMetrics {
  averageValue: number;
  conversionRate: number;
  avgDaysToConvert: number;
  totalQuotes: number;
}

export async function getQuoteMetrics(
  supabase: SupabaseClient
): Promise<QuoteMetrics> {
  const { data, error } = await supabase
    .from('quotes')
    .select('status, total_amount, created_at, updated_at')
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching quote metrics:', error.message);
    throw new Error('Failed to fetch quote metrics');
  }

  const quotes = data || [];
  const totalQuotes = quotes.length;

  if (totalQuotes === 0) {
    return { averageValue: 0, conversionRate: 0, avgDaysToConvert: 0, totalQuotes: 0 };
  }

  // Average value
  const totalAmount = quotes.reduce((sum, q) => sum + (q.total_amount ?? 0), 0);
  const averageValue = Math.round((totalAmount / totalQuotes) * 100) / 100;

  // Booking rate: converted / (total - drafts) * 100
  // Only counts quotes that became actual bookings (converted), not just accepted
  const draftCount = quotes.filter((q) => q.status === 'draft').length;
  const convertedCount = quotes.filter((q) => q.status === 'converted').length;
  const denominator = totalQuotes - draftCount;
  const conversionRate =
    denominator > 0
      ? Math.round((convertedCount / denominator) * 100 * 100) / 100
      : 0;

  // Avg days to convert
  const convertedQuotes = quotes.filter((q) => q.status === 'converted');
  let avgDaysToConvert = 0;
  if (convertedQuotes.length > 0) {
    const totalDays = convertedQuotes.reduce((sum, q) => {
      const created = new Date(q.created_at).getTime();
      const updated = new Date(q.updated_at).getTime();
      return sum + (updated - created) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToConvert = Math.round((totalDays / convertedQuotes.length) * 100) / 100;
  }

  return { averageValue, conversionRate, avgDaysToConvert, totalQuotes };
}

// ---------------------------------------------------------------------------
// getQuoteSentCounts
// ---------------------------------------------------------------------------

export async function getQuoteSentCounts(
  supabase: SupabaseClient,
  quoteIds: string[]
): Promise<Record<string, number>> {
  if (quoteIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('quote_communications')
    .select('quote_id')
    .in('quote_id', quoteIds);

  if (error) {
    console.error('Error fetching quote sent counts:', error.message);
    throw new Error('Failed to fetch quote sent counts');
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.quote_id] = (counts[row.quote_id] || 0) + 1;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// listQuotesAdmin
// ---------------------------------------------------------------------------

interface ListQuotesAdminOptions {
  status?: string | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  createdBy?: string | null;
  page?: number;
  limit?: number;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
}

interface ListQuotesAdminResult {
  quotes: unknown[];
  total: number;
  page: number;
  limit: number;
}

export async function listQuotesAdmin(
  supabase: SupabaseClient,
  options: ListQuotesAdminOptions = {}
): Promise<ListQuotesAdminResult> {
  const {
    status,
    search,
    dateFrom,
    dateTo,
    createdBy,
    page = 1,
    limit = 20,
    sortColumn,
    sortDirection,
  } = options;
  const offset = (page - 1) * limit;

  // Determine sort — only allow known columns
  const allowedSortCols = ['created_at', 'total_amount', 'quote_number', 'status', 'valid_until'];
  const effectiveSortCol = sortColumn && allowedSortCols.includes(sortColumn) ? sortColumn : 'created_at';
  const effectiveSortAsc = sortDirection === 'asc';

  let query = supabase
    .from('quotes')
    .select(QUOTE_LIST_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order(effectiveSortCol, { ascending: effectiveSortAsc })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59`);
  }

  if (createdBy) {
    query = query.eq('created_by', createdBy);
  }

  if (search) {
    query = query.or(`quote_number.ilike.%${search}%`);
  }

  const { data: quotes, error, count } = await query;

  if (error) {
    console.error('Error fetching admin quotes:', error.message);
    throw new Error('Failed to fetch quotes');
  }

  // Post-fetch filter for customer name search (same pattern as listQuotes)
  let filtered = quotes || [];
  if (search && filtered.length > 0) {
    const q = search.toLowerCase();
    filtered = filtered.filter((quote) => {
      const matchesNumber = quote.quote_number?.toLowerCase().includes(q);
      const cust = quote.customer as {
        first_name?: string;
        last_name?: string;
      } | null;
      const matchesName = cust
        ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`
            .toLowerCase()
            .includes(q)
        : false;
      return matchesNumber || matchesName;
    });
  }

  return {
    quotes: filtered,
    total: search ? filtered.length : (count ?? 0),
    page,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Error classes for typed error handling in routes
// ---------------------------------------------------------------------------

export class QuoteNotFoundError extends Error {
  constructor() {
    super('Quote not found');
    this.name = 'QuoteNotFoundError';
  }
}

export class QuoteDraftOnlyError extends Error {
  constructor() {
    super('Only draft quotes can be deleted');
    this.name = 'QuoteDraftOnlyError';
  }
}

export class QuoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteValidationError';
  }
}

// ---------------------------------------------------------------------------
// Mobile resolution helper — shared by createQuote + updateQuote
// ---------------------------------------------------------------------------

/**
 * Phase Mobile-1.9 — delegates to the shared `resolveMobileFields` helper.
 * Rationale: the same five-field validation + zone re-fetch + surcharge
 * re-snapshot rules now run on quote write (this file), booking write
 * (`/api/book`), and appointment mobile-service edit (Phase 1.9 PATCH
 * endpoints). Duplicating the rules in three places risked drift; the
 * shared resolver is the single source of truth. We re-throw the
 * generic `MobileFieldsError` as `QuoteValidationError` so existing
 * quote API callers (which catch the latter) keep working unchanged.
 */
async function resolveMobileForQuote(
  supabase: SupabaseClient,
  data: MobileFieldsInput
): Promise<ResolvedMobileFields> {
  try {
    return await resolveMobileFields(supabase, data);
  } catch (err) {
    if (err instanceof MobileFieldsError) {
      throw new QuoteValidationError(err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Modifier-snapshot helpers (Item 15g Layer 15g-ii)
// ---------------------------------------------------------------------------

interface ManualDiscountInput {
  manual_discount_type?: 'dollar' | 'percent' | null;
  manual_discount_value?: number | null;
  manual_discount_label?: string | null;
}

/**
 * Collapse a partial manual-discount payload to a fully-coherent triple.
 * The DB CHECK constraint `quotes_manual_discount_coherent` requires either
 * (type, value) both present (with type ∈ {dollar, percent} and value > 0,
 * percent additionally ≤ 100) or both NULL. Label is independent on quotes
 * (NULL allowed even when value is present). Helpers like this prevent the
 * "user supplied only the label" footgun.
 */
function normalizeManualDiscount(data: ManualDiscountInput): {
  type: 'dollar' | 'percent' | null;
  value: number | null;
  label: string | null;
} {
  const type = data.manual_discount_type ?? null;
  const rawValue = data.manual_discount_value;
  const value =
    rawValue === undefined || rawValue === null
      ? null
      : Number(rawValue);
  const label = data.manual_discount_label?.trim() || null;

  // Collapse to fully-null when either half is missing or value is non-positive.
  if (type === null || value === null || !(value > 0)) {
    return { type: null, value: null, label: null };
  }
  if (type === 'percent' && value > 100) {
    throw new QuoteValidationError('Percent manual discount cannot exceed 100');
  }
  return { type, value, label };
}

interface LoyaltyRedemptionInput {
  loyalty_points_to_redeem?: number | null;
  loyalty_discount?: number | null;
}

// ---------------------------------------------------------------------------
// computeQuoteTotals — single writer-side total formula (Item 15g Layer 15g-v)
// ---------------------------------------------------------------------------

/**
 * Inputs for the canonical writer-side quote-total formula. Mirrors the
 * in-memory reducer math at `src/app/pos/context/quote-reducer.ts:45-62`
 * and the convert-side modifier resolution at `convert-service.ts:79-105`
 * so the persisted `quotes.total_amount` matches both:
 *   1. The live total the operator sees in the POS quote builder.
 *   2. The `appointments.total_amount` that convert-service eventually writes.
 *
 * Pre-Layer-15g-v writers wrote `subtotal + tax` with no modifier subtraction,
 * leaving 17 of 18 readers (SMS link, email, PDF, public landing, voice
 * agent, AI responder, analytics) displaying inflated pre-discount totals.
 * See `docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md` for the full
 * audit chain.
 */
interface QuoteTotalsInput {
  items: Array<{ quantity: number; unit_price: number; product_id?: string | null }>;
  mobileSurcharge: number;
  couponDiscount?: number | null;
  loyaltyDiscount?: number | null;
  manualDiscountType?: 'dollar' | 'percent' | null;
  manualDiscountValue?: number | null;
}

interface QuoteTotalsResult {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotalsResult {
  const itemsSubtotal = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  const subtotal = Math.round((itemsSubtotal + input.mobileSurcharge) * 100) / 100;

  // Tax: applied to items with product_id (products taxable, services not).
  // Mobile fee is NOT taxable (CDTFA Pub 100 — separately-stated delivery).
  const taxableAmount = input.items.reduce((sum, item) => {
    if (item.product_id) {
      return sum + item.quantity * item.unit_price;
    }
    return sum;
  }, 0);
  const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;

  const coupon = Number(input.couponDiscount ?? 0) || 0;
  const loyalty = Number(input.loyaltyDiscount ?? 0) || 0;
  const manual =
    resolveManualDiscountAmount(
      input.manualDiscountType ?? null,
      input.manualDiscountValue ?? null,
      subtotal
    ) ?? 0;
  const totalDiscount = coupon + loyalty + manual;

  const totalAmount = Math.max(
    0,
    Math.round((subtotal + taxAmount - totalDiscount) * 100) / 100
  );

  return { subtotal, taxAmount, totalAmount };
}

/**
 * Collapse a partial loyalty-redemption payload to a coherent pair.
 * DB CHECK constraint `quotes_loyalty_coherent` requires both NULL or both
 * non-null+non-negative. Helper rounds points to int and validates non-negative.
 */
function normalizeLoyaltyRedemption(data: LoyaltyRedemptionInput): {
  points: number | null;
  discount: number | null;
} {
  const rawPoints = data.loyalty_points_to_redeem;
  const rawDiscount = data.loyalty_discount;
  if (
    (rawPoints === undefined || rawPoints === null) &&
    (rawDiscount === undefined || rawDiscount === null)
  ) {
    return { points: null, discount: null };
  }
  const points =
    rawPoints === undefined || rawPoints === null
      ? 0
      : Math.max(0, Math.round(Number(rawPoints)));
  const discount =
    rawDiscount === undefined || rawDiscount === null
      ? 0
      : Math.max(0, Number(rawDiscount));
  return { points, discount };
}
