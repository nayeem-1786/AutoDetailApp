import { SupabaseClient } from '@supabase/supabase-js';
import { generateQuoteNumber } from '@/lib/utils/quote-number';
import { fireWebhook } from '@/lib/utils/webhook';
import { TAX_RATE } from '@/lib/utils/constants';
import type { CreateQuoteInput, UpdateQuoteInput } from '@/lib/utils/validation';

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
  customer:customers(id, first_name, last_name, phone, email, address_line_1, city, state, zip, loyalty_points_balance),
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
  createdBy?: string | null
): Promise<CreateQuoteResult> {
  const quoteNumber = await generateQuoteNumber(supabase);

  const subtotal = data.items.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price;
  }, 0);

  // Tax: apply TAX_RATE to items with product_id (products are taxable)
  const taxableAmount = data.items.reduce((sum, item) => {
    if (item.product_id) {
      return sum + item.quantity * item.unit_price;
    }
    return sum;
  }, 0);
  const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  // Generate short access token for public quote link (6 chars, 56.8B combos)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const accessToken = Array.from(bytes, (b) => chars[b % chars.length]).join('');

  const insertPayload: Record<string, unknown> = {
    quote_number: quoteNumber,
    customer_id: data.customer_id,
    vehicle_id: data.vehicle_id || null,
    status: data.status || 'draft',
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    notes: data.notes || null,
    valid_until: data.valid_until || null,
    access_token: accessToken,
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

  // Fire webhook (fire-and-forget)
  fireWebhook('quote_created', createdQuote, supabase).catch(() => {});

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

  // If items provided, recalculate totals
  if (data.items && data.items.length > 0) {
    const subtotal = data.items.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);

    const taxableAmount = data.items.reduce((sum, item) => {
      if (item.product_id) {
        return sum + item.quantity * item.unit_price;
      }
      return sum;
    }, 0);

    const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    update.subtotal = subtotal;
    update.tax_amount = taxAmount;
    update.total_amount = totalAmount;

    // Delete existing items and re-insert
    const { error: deleteErr } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', quoteId);

    if (deleteErr) {
      console.error('Error deleting quote items:', deleteErr.message);
      throw new Error('Failed to update quote items');
    }

    const newItems = data.items.map((item) => ({
      quote_id: quoteId,
      service_id: item.service_id || null,
      product_id: item.product_id || null,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
      tier_name: item.tier_name || null,
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
