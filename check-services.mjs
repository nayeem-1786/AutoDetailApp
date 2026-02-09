import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://zwvahzymzardmxixyfim.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dmFoenltemFyZG14aXh5ZmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAwMTgwOSwiZXhwIjoyMDg1NTc3ODA5fQ.25s5srWPhhyaQccSy74HK5ssqFHwC3MXsPkibatxHD0');

const { data } = await sb.from('services').select('id, name, image_url').order('name');

const unmatched_square = [
  'Single-Stage Paint Correction', 'Undercarriage Steam Clean', 'Aircraft Clean Interior',
  'Motorcycle Detail Service', 'RV Wash - Exterior', 'Boat Clean Interior', 'Custom Service',
  'Hot Shampoo Services', 'Organic Fluid Clean Up', 'Booster Detail for Vehicles with Ceramic Coating',
  'Pet Hair Removal', 'Signature Complete Detail (Pro Detail)', '5-Year Ceramic Shield',
  'RV Clean - Interior', 'Boat Wash Exterior', 'Aircraft Wash Exterior'
];

const noImage = data.filter(s => !s.image_url);
const hasImage = data.filter(s => s.image_url);

console.log('=== SUPABASE SERVICES WITHOUT IMAGES (' + noImage.length + ') ===');
noImage.forEach(s => console.log('  ' + s.name));

console.log('\n=== UNMATCHED SQUARE SERVICES (' + unmatched_square.length + ') ===');
unmatched_square.forEach(s => console.log('  ' + s));

console.log('\n=== SUPABASE SERVICES WITH IMAGES (' + hasImage.length + ') ===');
hasImage.forEach(s => console.log('  ' + s.name));
