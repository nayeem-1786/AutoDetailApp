// Seed script: Create the Super-Admin account (Nayeem Khan)
// Run with: npx tsx scripts/seed-admin.ts
//
// Prerequisites:
// - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
// - Supabase project must be running (local or cloud)

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedAdmin() {
  const email = 'nayeem@smartdetailautospa.com';
  const password = 'ChangeMe123!'; // Must be changed on first login

  console.log('Creating Super-Admin auth user...');

  // Create auth user (email confirmation disabled for staff)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Skip email confirmation
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('Auth user already exists, fetching...');
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users.find((u) => u.email === email);
      if (existing) {
        await createEmployeeRecord(existing.id, email);
      }
      return;
    }
    console.error('Auth error:', authError.message);
    process.exit(1);
  }

  if (!authData.user) {
    console.error('No user returned');
    process.exit(1);
  }

  await createEmployeeRecord(authData.user.id, email);
}

async function createEmployeeRecord(authUserId: string, email: string) {
  console.log('Creating employee record...');

  const { data, error } = await supabase
    .from('employees')
    .upsert(
      {
        auth_user_id: authUserId,
        first_name: 'Nayeem',
        last_name: 'Khan',
        email,
        role: 'super_admin',
        status: 'active',
        bookable_for_appointments: false,
      },
      { onConflict: 'auth_user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Employee error:', error.message);
    process.exit(1);
  }

  console.log('Super-Admin created successfully!');
  console.log('  Email:', email);
  console.log('  Password: ChangeMe123! (change on first login)');
  console.log('  Role: super_admin');
  console.log('  Employee ID:', data.id);
}

seedAdmin().catch(console.error);
