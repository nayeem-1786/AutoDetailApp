import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://zwvahzymzardmxixyfim.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dmFoenltemFyZG14aXh5ZmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAwMTgwOSwiZXhwIjoyMDg1NTc3ODA5fQ.25s5srWPhhyaQccSy74HK5ssqFHwC3MXsPkibatxHD0'
);
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;

// 1. Get Supabase products without images
const { data: products } = await sb.from('products').select('id, name, image_url');
const noImage = products.filter(p => !p.image_url);
console.log(`=== SUPABASE PRODUCTS WITHOUT IMAGES (${noImage.length}) ===`);
noImage.forEach(p => console.log(`  ${p.name}`));

// 2. Get ALL Square catalog items (non-service)
const items = [];
let cursor = null;
do {
  const body = { object_types: ['ITEM'], limit: 100 };
  if (cursor) body.cursor = cursor;
  const resp = await fetch('https://connect.squareup.com/v2/catalog/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (json.objects) items.push(...json.objects);
  cursor = json.cursor;
} while (cursor);

const squareProducts = items.filter(i => i.item_data?.product_type !== 'APPOINTMENTS_SERVICE');

// 3. For each missing Supabase product, check if Square has an image
console.log(`\n=== CROSS-REFERENCE WITH SQUARE ===`);
const missingNames = noImage.map(p => p.name.toLowerCase().trim());

for (const prod of noImage) {
  const sqMatch = squareProducts.find(s =>
    s.item_data?.name?.toLowerCase().trim() === prod.name.toLowerCase().trim()
  );
  if (!sqMatch) {
    console.log(`❓ "${prod.name}" — NOT FOUND in Square catalog`);
  } else if (!sqMatch.item_data?.image_ids?.length) {
    console.log(`⚪ "${prod.name}" — exists in Square but HAS NO IMAGE`);
  } else {
    console.log(`🔴 "${prod.name}" — EXISTS in Square WITH IMAGE (import issue!)`);
  }
}

// Also check: Square products WITH images that don't have Supabase matches
const supabaseNames = new Set(products.map(p => p.name.toLowerCase().trim()));
const unmatchedSquare = squareProducts.filter(s =>
  s.item_data?.image_ids?.length &&
  !supabaseNames.has(s.item_data?.name?.toLowerCase().trim())
);
if (unmatchedSquare.length) {
  console.log(`\n=== SQUARE PRODUCTS WITH IMAGES BUT NO SUPABASE MATCH (${unmatchedSquare.length}) ===`);
  unmatchedSquare.forEach(s => console.log(`  ${s.item_data?.name}`));
}
