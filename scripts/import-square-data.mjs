/**
 * Square Data Import Script
 *
 * Reads Square CSV exports and imports into Supabase following DATA_MIGRATION_RULES.md.
 *
 * Execution order (per foreign key dependencies):
 *   1. Customers (Tier 1-3, skip Tier 4)
 *   2. Vendors + Products
 *   3. Transactions + Line Items + Payments
 *   4. Vehicles (inferred from service transactions)
 *   5. Loyalty points (calculated from eligible spend)
 *
 * Usage: node scripts/import-square-data.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR = '/Users/nayeem/Claude/SmartDetails/Square_Data';
const CUSTOMERS_CSV = `${DATA_DIR}/Customers/export-20260202-001509.csv`;
const PRODUCTS_CSV = `${DATA_DIR}/Products/ML665XQAASCMS_catalog-2026-02-02-0014.csv`;
const TRANSACTION_FILES = [
  { items: `${DATA_DIR}/Transactions/2021/items-2021-01-01-2022-01-01.csv`, txns: `${DATA_DIR}/Transactions/2021/transactions-2021-01-01-2022-01-01.csv` },
  { items: `${DATA_DIR}/Transactions/2022/items-2022-01-01-2023-01-01.csv`, txns: `${DATA_DIR}/Transactions/2022/transactions-2022-01-01-2023-01-01.csv` },
  { items: `${DATA_DIR}/Transactions/2023/items-2023-01-01-2024-01-01.csv`, txns: `${DATA_DIR}/Transactions/2023/transactions-2023-01-01-2024-01-01.csv` },
  { items: `${DATA_DIR}/Transactions/2024/items-2024-01-01-2025-01-01 (1).csv`, txns: `${DATA_DIR}/Transactions/2024/transactions-2024-01-01-2025-01-01.csv` },
  { items: `${DATA_DIR}/Transactions/2025/items-2025-01-01-2026-01-01.csv`, txns: `${DATA_DIR}/Transactions/2025/transactions-2025-01-01-2026-01-01.csv` },
];

const WATER_SKU = '0000001';
const CC_FEE_SKU = '305152J';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readCsv(path) {
  const content = readFileSync(path, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

function normalizePhone(raw) {
  if (!raw) return null;
  // Remove quotes, +, (, ), -, spaces
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null; // invalid
}

function parseDollar(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Category mapping from Square to our system
const CATEGORY_MAP = {
  'Accessories': 'accessories',
  'Paint Correction': 'paint-correction',
  'Brushes': 'brushes',
  'Microfibers': 'microfibers',
  'Paint Protection': 'paint-protection',
  'All Purpose Cleaners': 'cleaners',
  'Cleaners': 'cleaners',
  'Tires & Trims': 'tires-trims',
  'Interior Care': 'interior-care',
  'Scents & Deodorizers': 'scents-deodorizers',
  'Soaps & Shampoos': 'soaps-shampoos',
  'Tools': 'tools',
  'Water': 'water',
};

// Vehicle size mapping per Rule S-3
const SIZE_MAP = {
  'vehicle size - small': 'sedan',
  'car': 'sedan',
  'car/truck': 'sedan',
  'regular': 'sedan',
  'vehicle size - medium': 'truck_suv_2row',
  'suv': 'truck_suv_2row',
  'suv and van': 'truck_suv_2row',
  'truck': 'truck_suv_2row',
  'vehicle size - large': 'suv_3row_van',
  'van': 'suv_3row_van',
};

function mapSizeClass(pricePointName) {
  if (!pricePointName) return null;
  return SIZE_MAP[pricePointName.toLowerCase().trim()] || null;
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function batchInsert(table, rows, batchSize = 50) {
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase.from(table).insert(batch).select('id');
    if (error) {
      // Try individual inserts
      for (const row of batch) {
        const { error: singleError } = await supabase.from(table).insert(row);
        if (singleError) {
          errors++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data?.length || batch.length;
    }
  }
  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Step 1: Import Customers
// ---------------------------------------------------------------------------

async function importCustomers() {
  log('=== Step 1: Importing Customers ===');
  const rows = readCsv(CUSTOMERS_CSV);
  log(`  Parsed ${rows.length} customer rows from CSV`);

  const toImport = [];
  let tier1 = 0, tier2 = 0, tier3 = 0, tier4 = 0;

  for (const row of rows) {
    const phone = normalizePhone(row['Phone Number']);
    const email = (row['Email Address'] || '').trim().toLowerCase() || null;
    const firstName = (row['First Name'] || '').trim();
    const lastName = (row['Last Name'] || '').trim();
    const txnCount = parseInt(row['Transaction Count']) || 0;
    const spend = parseDollar(row['Lifetime Spend']);

    // Skip obvious junk entries (Rule C-6)
    if (firstName === '.' || firstName === '7/11') {
      tier4++;
      continue;
    }

    // Tier classification per Rule C-2
    if (phone && txnCount > 0) {
      tier1++;
    } else if (phone && txnCount === 0) {
      tier2++;
    } else if (!phone && email) {
      tier3++;
    } else {
      tier4++;
      continue; // Don't import Tier 4
    }

    const tags = [];
    const companyName = (row['Company Name'] || '').trim();
    if (companyName) tags.push(`company:${companyName}`);

    const creationSource = (row['Creation Source'] || '').trim().toLowerCase();
    if (creationSource) tags.push(`source:${creationSource}`);

    const instantProfile = (row['Instant Profile'] || '').trim();
    if (instantProfile === 'Yes') tags.push('instant_profile');

    // Tier 2 tag
    if (phone && txnCount === 0) tags.push('prospect');

    // Tier 3 flag
    if (!phone && email) tags.push('incomplete_profile');

    toImport.push({
      square_reference_id: row['Reference ID'] || null,
      square_customer_id: row['Square Customer ID'] || null,
      first_name: firstName || 'Unknown',
      last_name: lastName || '',
      phone: phone,
      email: email,
      birthday: row['Birthday'] || null,
      address_line_1: row['Street Address 1'] || null,
      address_line_2: row['Street Address 2'] || null,
      city: row['City'] || null,
      state: row['State'] || null,
      zip: row['Postal Code'] || null,
      notes: row['Memo'] || null,
      tags,
      sms_consent: false, // Rule C-4: start fresh
      email_consent: false,
      visit_count: txnCount,
      lifetime_spend: spend,
      first_visit_date: row['First Visit'] || null,
      last_visit_date: row['Last Visit'] || null,
      loyalty_points_balance: 0, // Calculated in Step 5
    });
  }

  log(`  Tiers: T1=${tier1}, T2=${tier2}, T3=${tier3}, T4=${tier4} (skipped)`);
  log(`  Importing ${toImport.length} customers...`);

  // Use upsert with phone to handle duplicates
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < toImport.length; i += 50) {
    const batch = toImport.slice(i, i + 50);

    // Split into phone-based and email-only
    const withPhone = batch.filter(c => c.phone);
    const emailOnly = batch.filter(c => !c.phone);

    if (withPhone.length > 0) {
      const { data, error } = await supabase
        .from('customers')
        .upsert(withPhone, { onConflict: 'phone', ignoreDuplicates: true })
        .select('id');

      if (error) {
        // Individual fallback
        for (const row of withPhone) {
          const { error: singleErr } = await supabase.from('customers').insert(row);
          if (singleErr) errors++;
          else imported++;
        }
      } else {
        imported += data?.length || withPhone.length;
      }
    }

    // Email-only customers — straight insert
    for (const row of emailOnly) {
      const { error: singleErr } = await supabase.from('customers').insert(row);
      if (singleErr) errors++;
      else imported++;
    }
  }

  log(`  Customers imported: ${imported}, errors: ${errors}`);
  return imported;
}

// ---------------------------------------------------------------------------
// Step 2: Import Vendors + Products
// ---------------------------------------------------------------------------

async function importProducts() {
  log('=== Step 2: Importing Products ===');
  const rows = readCsv(PRODUCTS_CSV);
  log(`  Parsed ${rows.length} product rows from CSV`);

  // Step 2a: Extract and create vendors
  const vendorNames = [...new Set(rows.map(r => (r['Default Vendor Name'] || '').trim()).filter(Boolean))];
  log(`  Found ${vendorNames.length} unique vendors`);

  const vendorMap = new Map(); // name -> id

  for (const name of vendorNames) {
    const { data: existing } = await supabase
      .from('vendors')
      .select('id')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      vendorMap.set(name, existing.id);
    } else {
      const { data: created, error } = await supabase
        .from('vendors')
        .insert({ name, is_active: true })
        .select('id')
        .single();

      if (!error && created) {
        vendorMap.set(name, created.id);
      }
    }
  }

  log(`  Vendors created/resolved: ${vendorMap.size}`);

  // Step 2b: Resolve category IDs
  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, slug');

  const categoryMap = new Map(); // slug -> id
  categories?.forEach(c => categoryMap.set(c.slug, c.id));

  // Step 2c: Import products
  const productRows = [];

  for (const row of rows) {
    const name = (row['Item Name'] || '').trim();
    const sku = (row['SKU'] || '').trim();
    const archived = (row['Archived'] || '').trim() === 'Y';

    // Skip CC fee item (Rule P-5) and Custom Amount
    if (sku === CC_FEE_SKU || name.toLowerCase() === 'custom amount') continue;

    // Map category
    const squareCategory = (row['Categories'] || row['Reporting Category'] || '').trim();
    const categorySlug = CATEGORY_MAP[squareCategory] || 'uncategorized';
    const categoryId = categoryMap.get(categorySlug) || null;

    // Map vendor
    const vendorName = (row['Default Vendor Name'] || '').trim();
    const vendorId = vendorName ? (vendorMap.get(vendorName) || null) : null;

    // Parse prices
    const retailPrice = parseDollar(row['Price']);
    const costPrice = parseDollar(row['Default Unit Cost']);

    // Parse quantity — column name includes location name
    let quantity = 0;
    const qtyKey = Object.keys(row).find(k => k.startsWith('Current Quantity'));
    if (qtyKey) quantity = parseInt(row[qtyKey]) || 0;

    // Parse stock alert
    let reorderThreshold = null;
    const alertKey = Object.keys(row).find(k => k.startsWith('Stock Alert Count'));
    if (alertKey) reorderThreshold = parseInt(row[alertKey]) || null;

    // Tax
    const taxKey = Object.keys(row).find(k => k.startsWith('Tax -'));
    const isTaxable = taxKey ? (row[taxKey] || '').trim() === 'Y' : true;

    // Generate unique slug
    let baseSlug = slugify(name);
    if (!baseSlug) baseSlug = 'product';
    let slug = baseSlug;
    let slugCounter = 1;
    const usedSlugs = new Set(productRows.map(p => p.slug));
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${++slugCounter}`;
    }

    productRows.push({
      square_item_id: row['Token'] || null,
      sku: sku || null,
      name,
      slug,
      description: row['Description'] || null,
      category_id: categoryId,
      vendor_id: vendorId,
      cost_price: costPrice,
      retail_price: retailPrice,
      quantity_on_hand: quantity,
      reorder_threshold: reorderThreshold,
      is_taxable: isTaxable,
      is_loyalty_eligible: true,
      barcode: row['GTIN'] || null,
      is_active: !archived,
    });
  }

  log(`  Importing ${productRows.length} products...`);

  // Use upsert on square_item_id so re-imports are safe.
  // cost_price is only set on insert — existing manual edits are preserved.
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  for (let i = 0; i < productRows.length; i += 50) {
    const batch = productRows.slice(i, i + 50);
    for (const row of batch) {
      if (row.square_item_id) {
        // Check if product already exists
        const { data: existing } = await supabase
          .from('products')
          .select('id, cost_price')
          .eq('square_item_id', row.square_item_id)
          .maybeSingle();

        if (existing) {
          // Update but preserve cost_price if already set
          const updatePayload = { ...row };
          delete updatePayload.square_item_id;
          delete updatePayload.slug; // Don't overwrite slug
          if (existing.cost_price && existing.cost_price > 0) {
            delete updatePayload.cost_price; // Don't overwrite manual edits
          }
          const { error } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', existing.id);
          if (error) { errors++; } else { updated++; }
          continue;
        }
      }
      // New product — insert
      const { error } = await supabase.from('products').insert(row);
      if (error) { errors++; } else { inserted++; }
    }
  }
  log(`  Products: ${inserted} inserted, ${updated} updated, ${errors} errors`);
  return inserted + updated;
}

// ---------------------------------------------------------------------------
// Step 3: Import Transactions
// ---------------------------------------------------------------------------

async function importTransactions() {
  log('=== Step 3: Importing Transactions ===');

  // Build customer reference map
  log('  Loading customer reference IDs...');
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, square_customer_id, square_reference_id');

  const custBySquareId = new Map();
  const custByRefId = new Map();
  allCustomers?.forEach(c => {
    if (c.square_customer_id) custBySquareId.set(c.square_customer_id, c.id);
    if (c.square_reference_id) custByRefId.set(c.square_reference_id, c.id);
  });
  log(`  Customer lookup: ${custBySquareId.size} by Square ID, ${custByRefId.size} by ref ID`);

  // Build employee name map
  const { data: employees } = await supabase.from('employees').select('id, first_name, last_name');
  const employeeMap = new Map();
  employees?.forEach(e => {
    employeeMap.set(`${e.first_name} ${e.last_name}`.trim(), e.id);
  });

  let totalTxns = 0;
  let totalItems = 0;
  let totalErrors = 0;

  for (const files of TRANSACTION_FILES) {
    log(`  Processing: ${files.txns.split('/').pop()}`);

    const txnRows = readCsv(files.txns);
    const itemRows = readCsv(files.items);

    log(`    ${txnRows.length} transactions, ${itemRows.length} items`);

    // Group items by transaction ID
    const itemsByTxn = new Map();
    for (const item of itemRows) {
      const txnId = item['Transaction ID'];
      if (!txnId) continue;
      if (!itemsByTxn.has(txnId)) itemsByTxn.set(txnId, []);
      itemsByTxn.get(txnId).push(item);
    }

    // Process transactions
    for (const txn of txnRows) {
      const eventType = (txn['Event Type'] || '').trim();
      // Only import "Payment" events (Rule T-3)
      if (eventType !== 'Payment') continue;

      const txnStatus = (txn['Transaction Status'] || '').trim();
      if (txnStatus !== 'Complete' && txnStatus !== 'Completed') continue;

      const squareTxnId = txn['Transaction ID'];
      if (!squareTxnId) continue;

      // Resolve customer
      const custId = txn['Customer ID'];
      const custRefId = txn['Customer Reference ID'];
      const customerId = (custId ? custBySquareId.get(custId) : null)
        || (custRefId ? custByRefId.get(custRefId) : null)
        || null;

      // Resolve employee
      const staffName = (txn['Staff Name'] || '').trim();
      const employeeId = staffName ? (employeeMap.get(staffName) || null) : null;

      // Parse amounts
      const grossSales = parseDollar(txn['Gross Sales']);
      const netSales = parseDollar(txn['Net Sales']);
      const tax = parseDollar(txn['Tax']);
      const tip = parseDollar(txn['Tip']);
      const discounts = parseDollar(txn['Discounts']);
      const totalCollected = parseDollar(txn['Total Collected']);
      const fees = parseDollar(txn['Fees']);
      const cardAmount = parseDollar(txn['Card']);
      const cashAmount = parseDollar(txn['Cash']);

      // Determine payment method
      let paymentMethod = null;
      if (cardAmount > 0 && cashAmount > 0) paymentMethod = 'split';
      else if (cardAmount > 0) paymentMethod = 'card';
      else if (cashAmount > 0) paymentMethod = 'cash';

      const txnDate = txn['Date'] || null;

      // Insert transaction
      const { data: txnRow, error: txnError } = await supabase
        .from('transactions')
        .insert({
          square_transaction_id: squareTxnId,
          customer_id: customerId,
          employee_id: employeeId,
          status: 'completed',
          subtotal: netSales,
          tax_amount: tax,
          tip_amount: tip,
          discount_amount: discounts,
          total_amount: totalCollected,
          payment_method: paymentMethod,
          transaction_date: txnDate,
          loyalty_points_earned: 0,
          loyalty_points_redeemed: 0,
          loyalty_discount: 0,
        })
        .select('id')
        .single();

      if (txnError) {
        totalErrors++;
        continue;
      }

      totalTxns++;

      // Insert line items
      const items = itemsByTxn.get(squareTxnId) || [];
      for (const item of items) {
        const itemName = (item['Item'] || '').trim();
        const sku = (item['SKU'] || '').trim();
        const qty = parseFloat(item['Qty']) || 1;
        const itemGross = parseDollar(item['Gross Sales']);
        const itemNet = parseDollar(item['Net Sales']);
        const itemTax = parseDollar(item['Tax']);
        const itemType = (item['Itemization Type'] || '').trim();

        // Skip CC fee items (Rule T-6)
        if (sku === CC_FEE_SKU) continue;
        // Skip $0 items unless there's a reason
        if (itemNet === 0 && itemGross === 0) continue;

        const isService = itemType === 'Service' || itemType === 'Appointments';
        const pricePointName = (item['Price Point Name'] || '').trim();

        const { error: itemError } = await supabase.from('transaction_items').insert({
          transaction_id: txnRow.id,
          item_type: isService ? 'service' : 'product',
          item_name: itemName,
          quantity: qty,
          unit_price: qty > 0 ? itemNet / qty : itemNet,
          total_price: itemNet,
          tax_amount: itemTax,
          is_taxable: itemTax > 0,
          tier_name: pricePointName || null,
          notes: itemType || null,
        });

        if (!itemError) totalItems++;
      }

      // Insert payment record
      if (paymentMethod) {
        const cardBrand = (txn['Card Brand'] || '').trim() || null;
        const panSuffix = (txn['PAN Suffix'] || '').trim() || null;

        await supabase.from('payments').insert({
          transaction_id: txnRow.id,
          method: paymentMethod === 'split' ? 'card' : paymentMethod,
          amount: totalCollected - tip,
          tip_amount: tip,
          tip_net: tip,
          card_brand: cardBrand,
          card_last_four: panSuffix,
        });
      }
    }
  }

  log(`  Transactions imported: ${totalTxns}`);
  log(`  Line items imported: ${totalItems}`);
  log(`  Errors: ${totalErrors}`);
  return { totalTxns, totalItems };
}

// ---------------------------------------------------------------------------
// Step 4: Infer Vehicles from Service Transactions
// ---------------------------------------------------------------------------

async function inferVehicles() {
  log('=== Step 4: Inferring Vehicles from Service History ===');

  // Find all service line items with customer linkage and a price point
  const { data: serviceItems } = await supabase
    .from('transaction_items')
    .select(`
      tier_name,
      transactions!inner(customer_id)
    `)
    .in('item_type', ['service'])
    .not('tier_name', 'is', null);

  if (!serviceItems || serviceItems.length === 0) {
    log('  No service transactions found with vehicle size info');
    return 0;
  }

  // Group by customer + size class
  const vehicleSet = new Map(); // "customerId:sizeClass" -> { customerId, sizeClass, count }

  for (const item of serviceItems) {
    const customerId = item.transactions?.customer_id;
    if (!customerId) continue;

    const sizeClass = mapSizeClass(item.tier_name);
    if (!sizeClass) continue;

    const key = `${customerId}:${sizeClass}`;
    if (!vehicleSet.has(key)) {
      vehicleSet.set(key, { customerId, sizeClass, count: 0 });
    }
    vehicleSet.get(key).count++;
  }

  log(`  Found ${vehicleSet.size} unique customer-vehicle combinations`);

  let created = 0;
  let skipped = 0;

  for (const [, v] of vehicleSet) {
    // Check if vehicle already exists
    const { data: existing } = await supabase
      .from('vehicles')
      .select('id')
      .eq('customer_id', v.customerId)
      .eq('size_class', v.sizeClass)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('vehicles').insert({
      customer_id: v.customerId,
      vehicle_type: 'standard',
      size_class: v.sizeClass,
      is_incomplete: true,
      notes: `Inferred from Square transaction history (${v.count} service${v.count > 1 ? 's' : ''}). Details to be captured on next visit.`,
    });

    if (!error) created++;
    else skipped++;
  }

  log(`  Vehicles created: ${created}, skipped: ${skipped}`);
  return created;
}

// ---------------------------------------------------------------------------
// Step 5: Calculate Loyalty Points
// ---------------------------------------------------------------------------

async function calculateLoyalty() {
  log('=== Step 5: Calculating Loyalty Points ===');

  // Get all customers with transactions
  const { data: customers } = await supabase
    .from('customers')
    .select('id, square_customer_id, square_reference_id')
    .or('visit_count.gt.0,lifetime_spend.gt.0');

  if (!customers || customers.length === 0) {
    log('  No customers with transaction history');
    return 0;
  }

  log(`  Processing ${customers.length} customers with transaction history`);

  // Find the water product SKU to exclude
  const { data: waterProducts } = await supabase
    .from('products')
    .select('id, name')
    .eq('sku', WATER_SKU);

  const waterProductNames = new Set(waterProducts?.map(p => p.name.toLowerCase().trim()) || []);
  // Also add common water names
  waterProductNames.add('water');
  waterProductNames.add('ro water');

  let updated = 0;
  let totalPoints = 0;

  for (const customer of customers) {
    // Get all transaction items for this customer
    const { data: txnItems } = await supabase
      .from('transaction_items')
      .select(`
        item_name,
        total_price,
        notes,
        transactions!inner(customer_id, status)
      `)
      .eq('transactions.customer_id', customer.id)
      .eq('transactions.status', 'completed');

    if (!txnItems || txnItems.length === 0) continue;

    // Calculate eligible spend (exclude water, Rule C-5)
    let eligibleSpend = 0;
    for (const item of txnItems) {
      const itemName = (item.item_name || '').toLowerCase().trim();
      // Exclude water purchases
      if (waterProductNames.has(itemName) || itemName.includes('water')) continue;
      // Include product and service sales
      eligibleSpend += Math.max(0, item.total_price || 0);
    }

    const points = Math.floor(eligibleSpend);
    if (points <= 0) continue;

    // Update customer balance
    const { error: updateError } = await supabase
      .from('customers')
      .update({ loyalty_points_balance: points })
      .eq('id', customer.id);

    if (updateError) continue;

    // Create ledger entry
    await supabase.from('loyalty_ledger').insert({
      customer_id: customer.id,
      action: 'welcome_bonus',
      points_change: points,
      points_balance: points,
      description: `Migration welcome bonus: ${points} points from $${eligibleSpend.toFixed(2)} eligible spend (water purchases excluded)`,
    });

    updated++;
    totalPoints += points;
  }

  log(`  Customers updated: ${updated}`);
  log(`  Total points awarded: ${totalPoints.toLocaleString()}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('Starting Square Data Import');
  log('============================');

  const customersImported = await importCustomers();
  const productsImported = await importProducts();
  const { totalTxns, totalItems } = await importTransactions();
  const vehiclesCreated = await inferVehicles();
  const loyaltyUpdated = await calculateLoyalty();

  log('');
  log('============================');
  log('Import Complete!');
  log('============================');
  log(`  Customers: ${customersImported}`);
  log(`  Products: ${productsImported}`);
  log(`  Transactions: ${totalTxns}`);
  log(`  Line Items: ${totalItems}`);
  log(`  Vehicles (inferred): ${vehiclesCreated}`);
  log(`  Loyalty (customers): ${loyaltyUpdated}`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
