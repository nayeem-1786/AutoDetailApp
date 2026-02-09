import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const sb = createClient(
  'https://zwvahzymzardmxixyfim.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dmFoenltemFyZG14aXh5ZmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAwMTgwOSwiZXhwIjoyMDg1NTc3ODA5fQ.25s5srWPhhyaQccSy74HK5ssqFHwC3MXsPkibatxHD0'
);

const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;

// Find the Square image for 1-Year Ceramic Shield
const body = { object_types: ['ITEM'], limit: 100 };
let cursor = null, found = null;
do {
  if (cursor) body.cursor = cursor;
  const resp = await fetch('https://connect.squareup.com/v2/catalog/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  for (const item of (json.objects || [])) {
    if (item.item_data?.name === '1-Year Ceramic Shield') { found = item; break; }
  }
  cursor = json.cursor;
} while (cursor && !found);

if (!found || !found.item_data?.image_ids?.length) {
  console.log('No image found in Square for 1-Year Ceramic Shield');
  process.exit(1);
}

// Get image URL
const imgResp = await fetch('https://connect.squareup.com/v2/catalog/batch-retrieve', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ object_ids: [found.item_data.image_ids[0]] }),
});
const imgJson = await imgResp.json();
const imgUrl = imgJson.objects?.[0]?.image_data?.url;
console.log('Square image URL:', imgUrl);

// Download
const dlResp = await fetch(imgUrl, { redirect: 'follow' });
let buf = Buffer.from(await dlResp.arrayBuffer());
const ct = dlResp.headers.get('content-type') || 'image/jpeg';
let ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
console.log(`Downloaded: ${(buf.length/1024/1024).toFixed(1)}MB (${ct})`);

if (buf.length > 4 * 1024 * 1024) {
  buf = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
  ext = 'jpg';
  console.log(`Compressed to: ${(buf.length/1024/1024).toFixed(1)}MB`);
}

// Get Supabase service ID
const { data: svc } = await sb.from('services').select('id, image_url').eq('name', '1-Year Ceramic Shield').single();
console.log('Supabase ID:', svc.id, 'Current image:', svc.image_url);

const path = `services/${svc.id}.${ext}`;
const { error: upErr } = await sb.storage.from('service-images').upload(path, buf, {
  contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
  upsert: true,
});
if (upErr) { console.log('Upload error:', upErr); process.exit(1); }

const publicUrl = `https://zwvahzymzardmxixyfim.supabase.co/storage/v1/object/public/service-images/${path}`;
const { error: dbErr } = await sb.from('services').update({ image_url: publicUrl }).eq('id', svc.id);
if (dbErr) { console.log('DB error:', dbErr); process.exit(1); }

console.log('✅ Done:', publicUrl);
