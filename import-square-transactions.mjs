#!/usr/bin/env node

/**
 * Square → Supabase Transaction Import Script
 * Smart Details Auto Spa
 *
 * PURPOSE: One-time import of all historical Square orders into Supabase
 * to establish a single source of truth for revenue reporting.
 *
 * WHAT IT DOES:
 * 1. Fetches ALL completed orders from Square (paginated, ~6066 orders)
 * 2. Maps Square customer IDs → Supabase customer UUIDs
 * 3. Deduplicates using square_transaction_id
 * 4. Inserts into transactions + transaction_items tables
 * 5. Classifies line items as service/product using item name keywords
 * 6. Recomputes customer stats (visit_count, lifetime_spend, last_visit_date)
 *
 * REQUIRED ENV VARS:
 *   SQUARE_ACCESS_TOKEN     - Square API access token
 *   SUPABASE_URL            - Supabase project URL
 *   SUPABASE_SERVICE_KEY    - Supabase service role key (bypasses RLS)
 *
 * USAGE:
 *   DRY_RUN=true node import-square-transactions.mjs   # Preview only, no writes
 *   node import-square-transactions.mjs                  # Full import
 *   SKIP_RECOMPUTE=true node import-square-transactions.mjs  # Import without recomputing stats
 */

import { createClient } from "@supabase/supabase-js";

// ─── Configuration ──────────────────────────────────────────────────────────

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DRY_RUN = process.env.DRY_RUN === "true";
const SKIP_RECOMPUTE = process.env.SKIP_RECOMPUTE === "true";

const SQUARE_API_BASE = "https://connect.squareup.com/v2";
const LOCATION_IDS = ["LQ808KKV46QKF", "LX4ZR7MQQJ9WV"]; // SDASAS (active) + MOBILE (inactive)
const ORDERS_PER_PAGE = 1000; // Square max
const SUPABASE_BATCH_SIZE = 100; // Rows per insert batch

// ─── Service Detection Keywords ─────────────────────────────────────────────
// These are the 38+ known service item names from your transaction_items table.
// An order line item matching ANY of these patterns is classified as item_type='service'.
// Everything else defaults to 'product'.

const SERVICE_EXACT_NAMES = new Set([
  "pro detail",
  "detail",
  "express detail",
  "express detail",
  "standard detail",
  "custom",
  "custom service",
  "express wash",
  "express exterior wash",
  "express interior clean",
  "plus wash",
  "booster wash",
  "booster detail for coated vehicle",
  "ceramic coating",
  "paint correction",
  "3-stage paint correction",
  "paint restoration color correct",
  "headlight restoration",
  "engine bay steam cleaned",
  "undercarriage steam cleaning",
  "hot shampoo extraction / 2 seats",
  "hot shampoo extraction",
  "hot shampoo services",
  "clay-bar treatment w/ ceramic wax",
  "clay-bar treatment",
  "interior extra care",
  "medium depth scratch removal",
  "scratch repair",
  "floor mats- scrub & shampoo (set of 4)",
  "flood damage / mold extraction",
  "motorcycle detail",
  "organic fluid clean up",
  "ozone treatment",
  "leather conditioning",
  "uv dressing treatment",
  "uv dressing treatment interior",
  "water mark removal",
  "boat exterior wash",
  "rv interior clean",
  "rvs detail",
  "signature complete detail (pro detail)",
]);

// Product indicator patterns — items with these are retail products, NOT services.
// Size/volume indicators and packaging terms indicate retail products.
const PRODUCT_INDICATOR_PATTERNS = [
  /\b\d+\s*oz\b/i,         // 16oz, 16 oz, 32oz
  /\b\d+\s*ml\b/i,         // 500ml, 750ml
  /\bgallon\b/i,            // 1 gallon, gallon
  /\b\d+\s*gal\b/i,        // 1gal
  /\b\d+\s*liter\b/i,      // 1 liter
  /\b\d+\s*pk\b/i,         // 3pk, 5pk (multi-pack)
  /\b\d+\s*pcs\b/i,        // 5pcs
  /\b\d+\s*pack\b/i,       // 2 pack
];

// Known retail brand prefixes — items starting with these are products
const PRODUCT_BRAND_PREFIXES = [
  "p&s ", "p & s ", "sonax ", "maxshine ", "meguiar", "chemical guys ",
  "adam's ", "griots ", "mothers ", "turtle wax ", "3d ", "carpro ",
  "gyeon ", "koch ", "rupes ", "flex ", "torq ",
];

// Keyword patterns for fuzzy matching — catches variations not in the exact list
const SERVICE_KEYWORD_PATTERNS = [
  /\bpro detail\b/i,
  /\bdetail\b(?!.*(?:brush|towel|bag|sponge|swab|shirt|hat|bucket|hand sanitizer|spray|kit|t-shirt|cleaner|product))/i,
  /\bceramic coat/i,
  /\bpaint correct/i,
  /\bpaint restor/i,
  /\bheadlight restor\b(?!.*(?:system|kit))/i,
  /\bscratch (removal|repair)\b/i,
  /\bsteam clean/i,
  /\bshampoo (extraction|services)\b/i,
  /\bclay.?bar treat/i,
  /\binterior extra care/i,
  /\bengine bay/i,
  /\bundercarriage/i,
  /\bflood damage/i,
  /\bmold extraction/i,
  /\bozone treat/i,
  /\bleather condition/i,
  /\buv dressing/i,
  /\bwater.?mark removal/i,
  /\bboat.*wash/i,
  /\brv\b.*\b(detail|clean)/i,
  /\bmotorcycle detail/i,
  /\bbooster (wash|detail)/i,
  /\bexpress (wash|exterior)\b(?!.*(?:cleaner|product))/i,
  /\bfull service/i,
  /\bcustom service/i,
];

// Product names that contain "detail" but are NOT services
const PRODUCT_EXCLUSIONS = new Set([
  "smart details small  spray bottle",
  "smart details 32oz spray bottle",
  "smart details spray bottle",
  "smart detail large gray microfiber towel",
  "professional detail brush set / 3pk",
  "sonax ceramic ultra slick detailer / 750ml",
  "sonax ceramic ultra slick detailer",
  "maxshine vent detailer soft brush set",
  "classic detailing brush / l",
  "classic detailing brush / m",
  "classic detailing brush / s",
  "detailing clay mitt",
  "smart details large gray and brown microfiber towel",
  "16oz supreme seal instant detailer",
  "maxshine clay bar towel cloth for car detailing, red",
  "detailing swabs",
  "detailing swabs 10pc",
  "p & s professional detail products - swift clean & shine",
  "quick detailer / 500ml",
  "quick detailer / 500ml",
  "smart details shirt",
  "soft detailing brush /m",
  "soft detailing brush / s",
  "nylon detail brush",
  "ceramic applicator auto detail sponges",
  "1gal supreme seal instant detailer",
  "32oz supreme seal instant detailer medium",
  "double pile detailing towel  / 2 pack",
  "smart details bucket",
  "smart details hat",
  "maxshine detail bag",
  "p&s off road detail kit / 5pcs",
  "single small detail brush",
  "smart detail auto spa t-shirt / xxlarge",
  "smart details auto spa t-shirt / large & xlarge",
  "smart details hand sanitizer",
  "smart details shirt",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function classifyItemType(itemName) {
  if (!itemName) return "product";

  const nameLower = itemName.toLowerCase().trim();

  // Check product exclusions first (products with "detail" in name)
  if (PRODUCT_EXCLUSIONS.has(nameLower)) return "product";

  // Check exact match against known services
  if (SERVICE_EXACT_NAMES.has(nameLower)) return "service";

  // Check product indicators — items with size/volume or brand prefixes are retail products
  for (const pattern of PRODUCT_INDICATOR_PATTERNS) {
    if (pattern.test(nameLower)) return "product";
  }
  for (const prefix of PRODUCT_BRAND_PREFIXES) {
    if (nameLower.startsWith(prefix)) return "product";
  }

  // Check keyword patterns for fuzzy match
  for (const pattern of SERVICE_KEYWORD_PATTERNS) {
    if (pattern.test(nameLower)) return "service";
  }

  return "product";
}

function mapPaymentMethod(tenders) {
  if (!tenders || tenders.length === 0) return "card";

  // Use the primary tender (first/largest)
  const primary = tenders[0];
  switch (primary.type) {
    case "CARD":
      return "card";
    case "CASH":
      return "cash";
    case "SQUARE_GIFT_CARD":
      return "gift_card";
    case "WALLET":
      return "digital_wallet";
    default:
      return "card";
  }
}

function centsToDecimal(amountObj) {
  if (!amountObj || typeof amountObj.amount !== "number") return 0;
  return amountObj.amount / 100;
}

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${msg}`);
}

function logError(msg, err) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.error(`[${timestamp}] ❌ ${msg}`, err?.message || err);
}

// ─── Square API ─────────────────────────────────────────────────────────────

async function fetchAllSquareOrders() {
  log("Fetching all completed orders from Square...");

  const allOrders = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    const body = {
      location_ids: LOCATION_IDS,
      query: {
        filter: {
          state_filter: { states: ["COMPLETED"] },
        },
        sort: {
          sort_field: "CREATED_AT",
          sort_order: "ASC",
        },
      },
      limit: ORDERS_PER_PAGE,
      return_entries: false,
    };

    if (cursor) body.cursor = cursor;

    const res = await fetch(`${SQUARE_API_BASE}/orders/search`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-12-18",
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Square API error (page ${page}): ${res.status} — ${errText}`
      );
    }

    const data = await res.json();
    const orders = data.orders || [];
    allOrders.push(...orders);

    log(`  Page ${page}: ${orders.length} orders (total: ${allOrders.length})`);

    if (!data.cursor) break;
    cursor = data.cursor;

    // Rate limit safety: 100ms pause between pages
    await new Promise((r) => setTimeout(r, 100));
  }

  log(`✅ Fetched ${allOrders.length} total orders from Square`);
  return allOrders;
}

// ─── Supabase Setup ─────────────────────────────────────────────────────────

function createSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

async function loadCustomerMapping(supabase) {
  log("Loading customer mapping (square_customer_id → supabase id)...");

  const { data, error } = await supabase
    .from("customers")
    .select("id, square_customer_id")
    .not("square_customer_id", "is", null)
    .limit(10000);

  if (error) throw new Error(`Failed to load customers: ${error.message}`);

  const mapping = new Map();
  for (const row of data || []) {
    if (row.square_customer_id) {
      mapping.set(row.square_customer_id, row.id);
    }
  }

  log(`✅ Loaded ${mapping.size} customer mappings`);
  return mapping;
}

async function loadExistingTransactionIds(supabase) {
  log("Loading existing square_transaction_ids for deduplication...");

  const { data, error } = await supabase
    .from("transactions")
    .select("square_transaction_id")
    .not("square_transaction_id", "is", null)
    .limit(10000);

  if (error)
    throw new Error(`Failed to load transaction IDs: ${error.message}`);

  const existing = new Set();
  for (const row of data || []) {
    if (row.square_transaction_id) {
      existing.add(row.square_transaction_id);
    }
  }

  log(`✅ Found ${existing.size} existing transactions to skip`);
  return existing;
}

// ─── Transform Square Order → Supabase Records ─────────────────────────────

function transformOrder(order, customerMapping) {
  const squareOrderId = order.id;
  const squareCustomerId = order.customer_id || null;
  const supabaseCustomerId = squareCustomerId
    ? customerMapping.get(squareCustomerId) || null
    : null;

  // Calculate subtotal from line items (sum of gross_sales before tax/discount)
  const lineItems = order.line_items || [];
  const subtotalCents = lineItems.reduce((sum, li) => {
    return sum + (li.gross_sales_money?.amount || 0);
  }, 0);

  const transaction = {
    square_transaction_id: squareOrderId,
    customer_id: supabaseCustomerId,
    status: "completed",
    subtotal: subtotalCents / 100,
    tax_amount: centsToDecimal(order.total_tax_money),
    tip_amount: centsToDecimal(order.total_tip_money),
    discount_amount: centsToDecimal(order.total_discount_money),
    total_amount: centsToDecimal(order.total_money),
    payment_method: mapPaymentMethod(order.tenders),
    transaction_date: order.closed_at || order.created_at,
    created_at: order.created_at,
    updated_at: order.updated_at || order.created_at,
  };

  const items = lineItems.map((li) => {
    const itemName = li.name || "Unknown Item";
    return {
      item_type: classifyItemType(itemName),
      item_name: itemName,
      quantity: parseInt(li.quantity, 10) || 1,
      unit_price: centsToDecimal(li.base_price_money),
      total_price: centsToDecimal(li.total_money),
      tax_amount: centsToDecimal(li.total_tax_money),
      is_taxable: (li.total_tax_money?.amount || 0) > 0,
      notes: li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
    };
  });

  return { transaction, items, squareCustomerId };
}

// ─── Insert Logic ───────────────────────────────────────────────────────────

async function insertTransactions(supabase, transformedOrders) {
  log(`Inserting ${transformedOrders.length} transactions...`);

  let inserted = 0;
  let itemsInserted = 0;
  let errors = 0;
  let noCustomer = 0;

  // Process in batches to avoid overwhelming Supabase
  for (let i = 0; i < transformedOrders.length; i += SUPABASE_BATCH_SIZE) {
    const batch = transformedOrders.slice(i, i + SUPABASE_BATCH_SIZE);

    // Insert transactions (upsert with ignoreDuplicates to skip any duplicates gracefully)
    const transactionRows = batch.map((o) => o.transaction);
    const { data: insertedTxns, error: txnError } = await supabase
      .from("transactions")
      .upsert(transactionRows, { onConflict: "square_transaction_id", ignoreDuplicates: true })
      .select("id, square_transaction_id");

    if (txnError) {
      logError(
        `Batch ${Math.floor(i / SUPABASE_BATCH_SIZE) + 1} transaction insert failed`,
        txnError
      );
      errors += batch.length;
      continue;
    }

    // Build a lookup: square_transaction_id → new supabase transaction UUID
    const txnIdMap = new Map();
    for (const row of insertedTxns || []) {
      txnIdMap.set(row.square_transaction_id, row.id);
    }

    // Insert transaction_items with foreign key to transaction
    const allItems = [];
    for (const order of batch) {
      const txnId = txnIdMap.get(order.transaction.square_transaction_id);
      if (!txnId) continue;

      for (const item of order.items) {
        allItems.push({ ...item, transaction_id: txnId });
      }
    }

    if (allItems.length > 0) {
      const { error: itemError } = await supabase
        .from("transaction_items")
        .insert(allItems);

      if (itemError) {
        logError(
          `Batch ${Math.floor(i / SUPABASE_BATCH_SIZE) + 1} items insert failed`,
          itemError
        );
      } else {
        itemsInserted += allItems.length;
      }
    }

    inserted += insertedTxns?.length || 0;
    noCustomer += batch.filter((o) => !o.transaction.customer_id).length;

    if ((i + SUPABASE_BATCH_SIZE) % 500 === 0 || i + SUPABASE_BATCH_SIZE >= transformedOrders.length) {
      log(
        `  Progress: ${inserted}/${transformedOrders.length} transactions, ${itemsInserted} items`
      );
    }
  }

  return { inserted, itemsInserted, errors, noCustomer };
}

// ─── Recompute Customer Stats ───────────────────────────────────────────────

async function recomputeCustomerStats(supabase) {
  log("Recomputing customer stats from transaction data...");

  // Get all transactions grouped by customer
  const { data: txns, error } = await supabase
    .from("transactions")
    .select("customer_id, total_amount, transaction_date")
    .not("customer_id", "is", null)
    .eq("status", "completed")
    .order("transaction_date", { ascending: false })
    .limit(50000);

  if (error)
    throw new Error(`Failed to load transactions for recompute: ${error.message}`);

  // Aggregate per customer
  const customerStats = new Map();
  for (const txn of txns || []) {
    if (!txn.customer_id) continue;

    if (!customerStats.has(txn.customer_id)) {
      customerStats.set(txn.customer_id, {
        visit_count: 0,
        lifetime_spend: 0,
        last_visit_date: null,
      });
    }

    const stats = customerStats.get(txn.customer_id);
    stats.visit_count++;
    stats.lifetime_spend += Number(txn.total_amount) || 0;

    const txnDate = txn.transaction_date?.slice(0, 10);
    if (txnDate && (!stats.last_visit_date || txnDate > stats.last_visit_date)) {
      stats.last_visit_date = txnDate;
    }
  }

  log(`  Updating stats for ${customerStats.size} customers...`);

  // Batch update customers
  let updated = 0;
  const entries = Array.from(customerStats.entries());

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);

    const promises = batch.map(([customerId, stats]) =>
      supabase
        .from("customers")
        .update({
          visit_count: stats.visit_count,
          lifetime_spend: Math.round(stats.lifetime_spend * 100) / 100,
          last_visit_date: stats.last_visit_date,
        })
        .eq("id", customerId)
    );

    const results = await Promise.all(promises);
    const batchErrors = results.filter((r) => r.error);
    if (batchErrors.length > 0) {
      logError(
        `${batchErrors.length} customer updates failed in batch`,
        batchErrors[0].error
      );
    }
    updated += batch.length - batchErrors.length;
  }

  log(`✅ Updated stats for ${updated} customers`);
  return updated;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Square → Supabase Transaction Import");
  console.log("  Smart Details Auto Spa");
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no writes)" : "🚀 LIVE IMPORT"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Validate env vars
  if (!SQUARE_ACCESS_TOKEN) {
    console.error("❌ Missing SQUARE_ACCESS_TOKEN env var");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env var");
    process.exit(1);
  }

  const supabase = createSupabaseClient();

  // ── Step 1: Load mappings ──
  const customerMapping = await loadCustomerMapping(supabase);
  const existingTxnIds = await loadExistingTransactionIds(supabase);

  // ── Step 2: Fetch all Square orders ──
  const allOrders = await fetchAllSquareOrders();

  // ── Step 3: Transform & deduplicate ──
  log("Transforming orders and deduplicating...");

  const toInsert = [];
  let skippedDupes = 0;
  let skippedNoLineItems = 0;
  let ordersWithCustomer = 0;
  let ordersWithMappedCustomer = 0;
  let serviceItemCount = 0;
  let productItemCount = 0;

  for (const order of allOrders) {
    // Skip if already in Supabase
    if (existingTxnIds.has(order.id)) {
      skippedDupes++;
      continue;
    }

    // Skip orders with no line items (refunds, voids, etc.)
    if (!order.line_items || order.line_items.length === 0) {
      skippedNoLineItems++;
      continue;
    }

    const transformed = transformOrder(order, customerMapping);
    toInsert.push(transformed);

    // Stats tracking
    if (order.customer_id) {
      ordersWithCustomer++;
      if (transformed.transaction.customer_id) {
        ordersWithMappedCustomer++;
      }
    }

    for (const item of transformed.items) {
      if (item.item_type === "service") serviceItemCount++;
      else productItemCount++;
    }
  }

  // ── Step 4: Summary before insert ──
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  IMPORT SUMMARY");
  console.log("──────────────────────────────────────────────────────────");
  console.log(`  Total Square orders fetched:     ${allOrders.length}`);
  console.log(`  Already in Supabase (skipped):   ${skippedDupes}`);
  console.log(`  No line items (skipped):         ${skippedNoLineItems}`);
  console.log(`  Ready to import:                 ${toInsert.length}`);
  console.log(`  ├─ Orders with Square customer:  ${ordersWithCustomer}`);
  console.log(`  ├─ Mapped to Supabase customer:  ${ordersWithMappedCustomer}`);
  console.log(`  ├─ No customer linked:           ${toInsert.length - ordersWithMappedCustomer}`);
  console.log(`  Line items to create:            ${serviceItemCount + productItemCount}`);
  console.log(`  ├─ Classified as SERVICE:         ${serviceItemCount}`);
  console.log(`  └─ Classified as PRODUCT:         ${productItemCount}`);

  // Revenue preview
  const totalRevenue = toInsert.reduce(
    (sum, o) => sum + o.transaction.total_amount,
    0
  );
  console.log(
    `  Total revenue to import:         $${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
  );
  console.log("──────────────────────────────────────────────────────────\n");

  if (DRY_RUN) {
    log("🔍 DRY RUN complete. No data was written.");
    log("   Remove DRY_RUN=true to execute the import.");

    // Print sample of first 5 orders for verification
    console.log("\n── Sample Orders (first 5) ──\n");
    for (const order of toInsert.slice(0, 5)) {
      const txn = order.transaction;
      console.log(
        `  ${txn.transaction_date?.slice(0, 10)} | $${txn.total_amount.toFixed(2).padStart(8)} | ` +
          `${txn.payment_method.padEnd(6)} | customer: ${txn.customer_id ? "✓" : "✗"} | ` +
          `items: ${order.items.map((i) => `${i.item_name} [${i.item_type}]`).join(", ")}`
      );
    }

    // Print sample of service items for verification
    console.log("\n── Service Items Found (sample) ──\n");
    const serviceItems = toInsert
      .flatMap((o) => o.items)
      .filter((i) => i.item_type === "service");
    const uniqueServices = [
      ...new Map(serviceItems.map((i) => [i.item_name, i])).values(),
    ];
    for (const item of uniqueServices.slice(0, 20)) {
      console.log(`  ✓ "${item.item_name}" → service`);
    }
    if (uniqueServices.length > 20) {
      console.log(`  ... and ${uniqueServices.length - 20} more`);
    }

    return;
  }

  // ── Step 5: Insert into Supabase ──
  const result = await insertTransactions(supabase, toInsert);

  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  INSERT RESULTS");
  console.log("──────────────────────────────────────────────────────────");
  console.log(`  Transactions inserted:    ${result.inserted}`);
  console.log(`  Transaction items inserted: ${result.itemsInserted}`);
  console.log(`  Failed:                   ${result.errors}`);
  console.log(`  No customer linked:       ${result.noCustomer}`);
  console.log("──────────────────────────────────────────────────────────\n");

  // ── Step 6: Recompute customer stats ──
  if (!SKIP_RECOMPUTE && result.inserted > 0) {
    await recomputeCustomerStats(supabase);
  } else if (SKIP_RECOMPUTE) {
    log("⏭️  Skipping customer stats recomputation (SKIP_RECOMPUTE=true)");
  }

  console.log("\n✅ Import complete.");
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n❌ FATAL ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
