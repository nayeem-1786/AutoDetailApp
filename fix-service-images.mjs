import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const sb = createClient(
  'https://zwvahzymzardmxixyfim.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dmFoenltemFyZG14aXh5ZmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAwMTgwOSwiZXhwIjoyMDg1NTc3ODA5fQ.25s5srWPhhyaQccSy74HK5ssqFHwC3MXsPkibatxHD0'
);

const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!SQUARE_TOKEN) { console.error('Missing SQUARE_ACCESS_TOKEN'); process.exit(1); }

const NAME_MAP = {
  'Single-Stage Paint Correction': 'Single-Stage Polish',
  'Undercarriage Steam Clean': 'Undercarriage Steam Cleaning',
  'Aircraft Clean Interior': 'Aircraft Interior Clean',
  'Motorcycle Detail Service': 'Complete Motorcycle Detail',
  'RV Wash - Exterior': 'RV Exterior Wash',
  'Boat Clean Interior': 'Boat Interior Clean',
  'Hot Shampoo Services': 'Hot Shampoo Extraction',
  'Organic Fluid Clean Up': 'Organic Stain Treatment',
  'Booster Detail for Vehicles with Ceramic Coating': 'Booster Detail for Ceramic Coated Vehicles',
  'Pet Hair Removal': 'Pet Hair & Dander Removal',
  'Signature Complete Detail (Pro Detail)': 'Signature Complete Detail',
  '5-Year Ceramic Shield': '5-Year Ceramic Shield Plus',
  'RV Clean - Interior': 'RV Interior Clean',
  'Boat Wash Exterior': 'Boat Exterior Wash',
  'Aircraft Wash Exterior': 'Aircraft Exterior Wash',
};

// Fetch Square catalog to get image URLs for these services
async function getSquareImages() {
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

  // Get image objects
  const imageIds = new Set();
  const serviceItems = items.filter(i => i.item_data?.product_type === 'APPOINTMENTS_SERVICE');
  serviceItems.forEach(i => (i.item_data.image_ids || []).forEach(id => imageIds.add(id)));

  const imgBody = { object_ids: [...imageIds], include_related_objects: false };
  const imgResp = await fetch('https://connect.squareup.com/v2/catalog/batch-retrieve', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(imgBody),
  });
  const imgJson = await imgResp.json();
  const imageMap = {};
  (imgJson.objects || []).forEach(o => { imageMap[o.id] = o.image_data?.url; });

  const result = {};
  serviceItems.forEach(i => {
    const name = i.item_data?.name;
    const imgId = (i.item_data?.image_ids || [])[0];
    if (name && imgId && imageMap[imgId]) result[name] = imageMap[imgId];
  });
  return result;
}

// Get Supabase services
const { data: services } = await sb.from('services').select('id, name').order('name');
const supabaseByName = {};
services.forEach(s => { supabaseByName[s.name] = s; });

const squareImages = await getSquareImages();

let ok = 0, fail = 0;
for (const [sqName, sbName] of Object.entries(NAME_MAP)) {
  const svc = supabaseByName[sbName];
  const imgUrl = squareImages[sqName];
  if (!svc) { console.log(`❌ No Supabase service: "${sbName}"`); fail++; continue; }
  if (!imgUrl) { console.log(`❌ No Square image: "${sqName}"`); fail++; continue; }

  try {
    // Download
    const resp = await fetch(imgUrl, { redirect: 'follow' });
    let buf = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    let ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

    // Compress if > 4MB
    if (buf.length > 4 * 1024 * 1024) {
      buf = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
      ext = 'jpg';
      console.log(`  ℹ️  Compressed "${sqName}" to ${(buf.length/1024/1024).toFixed(1)}MB`);
    }

    const path = `services/${svc.id}.${ext}`;
    const { error: upErr } = await sb.storage.from('service-images').upload(path, buf, {
      contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
      upsert: true,
    });
    if (upErr) throw upErr;

    const publicUrl = `https://zwvahzymzardmxixyfim.supabase.co/storage/v1/object/public/service-images/${path}`;
    const { error: dbErr } = await sb.from('services').update({ image_url: publicUrl }).eq('id', svc.id);
    if (dbErr) throw dbErr;

    console.log(`✅ "${sqName}" → "${sbName}" → ${publicUrl}`);
    ok++;
  } catch (e) {
    console.log(`❌ "${sqName}": ${e.message || JSON.stringify(e)}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 100));
}

console.log(`\nDone: ${ok} uploaded, ${fail} failed`);
