#!/usr/bin/env node
/**
 * import-square-images.mjs
 * 
 * Downloads product/service images from Square catalog and uploads them
 * to Supabase storage, then updates the image_url column.
 * 
 * Usage:
 *   SQUARE_ACCESS_TOKEN="..." \
 *   SUPABASE_URL="https://zwvahzymzardmxixyfim.supabase.co" \
 *   SUPABASE_SERVICE_KEY="..." \
 *   DRY_RUN=true \
 *   node import-square-images.mjs
 * 
 * Environment Variables:
 *   SQUARE_ACCESS_TOKEN  - Square API access token (required)
 *   SUPABASE_URL         - Supabase project URL (required)
 *   SUPABASE_SERVICE_KEY - Supabase service role key (required)
 *   DRY_RUN              - "true" to preview without uploading (default: false)
 *   SKIP_PRODUCTS        - "true" to skip products (default: false)
 *   SKIP_SERVICES        - "true" to skip services (default: false)
 *   MATCH_MODE           - "name" or "id" (default: "name")
 *                          "name" matches Square item name → Supabase product/service name
 *                          "id" matches Square catalog_object_id → square_catalog_item_id column
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import http from 'http';

// ─── Config ──────────────────────────────────────────────────────
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';
const SKIP_PRODUCTS = process.env.SKIP_PRODUCTS === 'true';
const SKIP_SERVICES = process.env.SKIP_SERVICES === 'true';
const MATCH_MODE = process.env.MATCH_MODE || 'name'; // "name" or "id"

if (!SQUARE_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!SQUARE_ACCESS_TOKEN) console.error('   - SQUARE_ACCESS_TOKEN');
  if (!SUPABASE_URL) console.error('   - SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) console.error('   - SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Counters ────────────────────────────────────────────────────
const stats = {
  squareItems: 0,
  squareImages: 0,
  products: { matched: 0, uploaded: 0, skipped: 0, failed: 0, alreadyHasImage: 0 },
  services: { matched: 0, uploaded: 0, skipped: 0, failed: 0, alreadyHasImage: 0 },
};

// ─── Square API ──────────────────────────────────────────────────
const SQUARE_BASE = 'https://connect.squareup.com/v2';

async function squareFetch(path, options = {}) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Square API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Fetch all catalog items with their related IMAGE objects.
 * Paginates through all results.
 */
async function fetchSquareCatalogWithImages() {
  const allItems = [];
  const imageMap = new Map(); // image_id → { url, name }
  let cursor = null;

  console.log('📦 Fetching Square catalog...');

  do {
    const body = {
      object_types: ['ITEM'],
      include_related_objects: true,
      limit: 100,
    };
    if (cursor) body.cursor = cursor;

    const data = await squareFetch('/catalog/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Collect IMAGE objects from related_objects
    if (data.related_objects) {
      for (const obj of data.related_objects) {
        if (obj.type === 'IMAGE' && obj.image_data?.url) {
          imageMap.set(obj.id, {
            url: obj.image_data.url,
            name: obj.image_data.name || null,
          });
        }
      }
    }

    // Collect ITEM objects
    if (data.objects) {
      for (const item of data.objects) {
        const itemData = item.item_data;
        if (!itemData) continue;

        const imageIds = itemData.image_ids || [];
        const images = imageIds
          .map(id => imageMap.get(id))
          .filter(Boolean);

        allItems.push({
          id: item.id,
          name: itemData.name,
          productType: itemData.product_type, // REGULAR or APPOINTMENTS_SERVICE
          imageIds,
          images,
          primaryImageUrl: images[0]?.url || null,
        });
      }
    }

    cursor = data.cursor;
  } while (cursor);

  stats.squareItems = allItems.length;
  stats.squareImages = imageMap.size;

  console.log(`   Found ${allItems.length} items, ${imageMap.size} images`);

  return allItems;
}

// ─── Image Download ──────────────────────────────────────────────

/**
 * Download an image from a URL and return it as a Buffer with content type.
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      client.get(requestUrl, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`));
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || 'image/jpeg';
          resolve({ buffer, contentType });
        });
        res.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

/**
 * Get file extension from content type.
 */
function extFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[contentType?.split(';')[0]?.trim()] || 'jpg';
}

// ─── Supabase Queries ────────────────────────────────────────────

async function fetchSupabaseProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, image_url, square_catalog_item_id')
    .order('name');

  if (error) {
    // If square_catalog_item_id column doesn't exist, retry without it
    if (error.message?.includes('square_catalog_item_id')) {
      console.log('   ⚠️  products table has no square_catalog_item_id column, using name match only');
      const { data: data2, error: error2 } = await supabase
        .from('products')
        .select('id, name, image_url')
        .order('name');
      if (error2) throw error2;
      return data2;
    }
    throw error;
  }
  return data;
}

async function fetchSupabaseServices() {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, image_url, square_catalog_item_id')
    .order('name');

  if (error) {
    if (error.message?.includes('square_catalog_item_id')) {
      console.log('   ⚠️  services table has no square_catalog_item_id column, using name match only');
      const { data: data2, error: error2 } = await supabase
        .from('services')
        .select('id, name, image_url')
        .order('name');
      if (error2) throw error2;
      return data2;
    }
    throw error;
  }
  return data;
}

// ─── Matching Logic ──────────────────────────────────────────────

/**
 * Normalize a name for fuzzy matching.
 * Strips special chars, extra whitespace, lowercases.
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match Square items to Supabase records.
 * Returns array of { squareItem, supabaseRecord } pairs.
 */
function matchItems(squareItems, supabaseRecords, mode) {
  const matched = [];
  const unmatched = [];

  if (mode === 'id') {
    // Match by square_catalog_item_id
    const idMap = new Map();
    for (const record of supabaseRecords) {
      if (record.square_catalog_item_id) {
        idMap.set(record.square_catalog_item_id, record);
      }
    }
    for (const item of squareItems) {
      const record = idMap.get(item.id);
      if (record) {
        matched.push({ squareItem: item, supabaseRecord: record });
      } else {
        unmatched.push(item);
      }
    }
  } else {
    // Match by name (normalized)
    const nameMap = new Map();
    for (const record of supabaseRecords) {
      nameMap.set(normalizeName(record.name), record);
    }

    for (const item of squareItems) {
      const normalizedSquareName = normalizeName(item.name);
      const record = nameMap.get(normalizedSquareName);
      if (record) {
        matched.push({ squareItem: item, supabaseRecord: record });
      } else {
        unmatched.push(item);
      }
    }
  }

  return { matched, unmatched };
}

// ─── Upload Logic ────────────────────────────────────────────────

/**
 * Upload image to Supabase storage and update the record.
 */
async function uploadAndUpdate({ squareItem, supabaseRecord, bucket, table }) {
  const imageUrl = squareItem.primaryImageUrl;
  if (!imageUrl) {
    console.log(`   ⏭️  "${squareItem.name}" — no image in Square`);
    return 'skipped';
  }

  // Skip if already has an image (unless you want to overwrite)
  if (supabaseRecord.image_url) {
    console.log(`   ✅ "${supabaseRecord.name}" — already has image, skipping`);
    return 'already_has_image';
  }

  if (DRY_RUN) {
    console.log(`   🔍 [DRY RUN] Would upload: "${squareItem.name}" → ${bucket}/${supabaseRecord.id}`);
    console.log(`      Source: ${imageUrl}`);
    return 'uploaded';
  }

  try {
    // Download from Square
    const { buffer, contentType } = await downloadImage(imageUrl);
    const ext = extFromContentType(contentType);
    const storagePath = `${table}/${supabaseRecord.id}.${ext}`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`   ❌ Upload failed for "${squareItem.name}": ${uploadError.message}`);
      return 'failed';
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update Supabase record
    const { error: updateError } = await supabase
      .from(table)
      .update({ image_url: publicUrl })
      .eq('id', supabaseRecord.id);

    if (updateError) {
      console.error(`   ❌ DB update failed for "${supabaseRecord.name}": ${updateError.message}`);
      return 'failed';
    }

    console.log(`   ✅ "${supabaseRecord.name}" → ${publicUrl}`);
    return 'uploaded';
  } catch (err) {
    console.error(`   ❌ Error processing "${squareItem.name}": ${err.message}`);
    return 'failed';
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Square → Supabase Image Import              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`Mode:       ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 LIVE'}`);
  console.log(`Match by:   ${MATCH_MODE}`);
  console.log(`Products:   ${SKIP_PRODUCTS ? 'SKIP' : 'IMPORT'}`);
  console.log(`Services:   ${SKIP_SERVICES ? 'SKIP' : 'IMPORT'}`);
  console.log();

  // Step 1: Fetch Square catalog
  const squareItems = await fetchSquareCatalogWithImages();

  // Separate products vs services
  const squareProducts = squareItems.filter(i => i.productType !== 'APPOINTMENTS_SERVICE');
  const squareServices = squareItems.filter(i => i.productType === 'APPOINTMENTS_SERVICE');

  console.log(`   Products: ${squareProducts.length} (${squareProducts.filter(p => p.primaryImageUrl).length} with images)`);
  console.log(`   Services: ${squareServices.length} (${squareServices.filter(s => s.primaryImageUrl).length} with images)`);
  console.log();

  // Step 2: Process Products
  if (!SKIP_PRODUCTS && squareProducts.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 PRODUCTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const supabaseProducts = await fetchSupabaseProducts();
    console.log(`   Supabase products: ${supabaseProducts.length}`);

    const { matched, unmatched } = matchItems(squareProducts, supabaseProducts, MATCH_MODE);
    stats.products.matched = matched.length;
    console.log(`   Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

    if (unmatched.length > 0) {
      console.log();
      console.log('   ⚠️  Unmatched Square products (no Supabase match):');
      for (const item of unmatched.slice(0, 15)) {
        console.log(`      - "${item.name}"`);
      }
      if (unmatched.length > 15) {
        console.log(`      ... and ${unmatched.length - 15} more`);
      }
    }
    console.log();

    // Upload each matched product
    for (const pair of matched) {
      const result = await uploadAndUpdate({
        ...pair,
        bucket: 'product-images',
        table: 'products',
      });

      if (result === 'uploaded') stats.products.uploaded++;
      else if (result === 'skipped') stats.products.skipped++;
      else if (result === 'already_has_image') stats.products.alreadyHasImage++;
      else if (result === 'failed') stats.products.failed++;

      // Small delay to be nice to APIs
      if (!DRY_RUN) await sleep(100);
    }
    console.log();
  }

  // Step 3: Process Services
  if (!SKIP_SERVICES && squareServices.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 SERVICES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const supabaseServices = await fetchSupabaseServices();
    console.log(`   Supabase services: ${supabaseServices.length}`);

    const { matched, unmatched } = matchItems(squareServices, supabaseServices, MATCH_MODE);
    stats.services.matched = matched.length;
    console.log(`   Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

    if (unmatched.length > 0) {
      console.log();
      console.log('   ⚠️  Unmatched Square services (no Supabase match):');
      for (const item of unmatched) {
        console.log(`      - "${item.name}"`);
      }
    }
    console.log();

    for (const pair of matched) {
      const result = await uploadAndUpdate({
        ...pair,
        bucket: 'service-images',
        table: 'services',
      });

      if (result === 'uploaded') stats.services.uploaded++;
      else if (result === 'skipped') stats.services.skipped++;
      else if (result === 'already_has_image') stats.services.alreadyHasImage++;
      else if (result === 'failed') stats.services.failed++;

      if (!DRY_RUN) await sleep(100);
    }
    console.log();
  }

  // Step 4: Summary
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     SUMMARY                                     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`Square catalog: ${stats.squareItems} items, ${stats.squareImages} images`);
  console.log();

  if (!SKIP_PRODUCTS) {
    console.log('Products:');
    console.log(`   Matched:          ${stats.products.matched}`);
    console.log(`   Uploaded:         ${stats.products.uploaded}`);
    console.log(`   Already had img:  ${stats.products.alreadyHasImage}`);
    console.log(`   Skipped (no img): ${stats.products.skipped}`);
    console.log(`   Failed:           ${stats.products.failed}`);
    console.log();
  }

  if (!SKIP_SERVICES) {
    console.log('Services:');
    console.log(`   Matched:          ${stats.services.matched}`);
    console.log(`   Uploaded:         ${stats.services.uploaded}`);
    console.log(`   Already had img:  ${stats.services.alreadyHasImage}`);
    console.log(`   Skipped (no img): ${stats.services.skipped}`);
    console.log(`   Failed:           ${stats.services.failed}`);
    console.log();
  }

  if (DRY_RUN) {
    console.log('🔍 This was a DRY RUN — no changes were made.');
    console.log('   Run without DRY_RUN=true to perform the actual import.');
  } else {
    console.log('✅ Import complete!');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
