import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const ACRONYMS = ['BMW', 'GMC', 'RAM', 'BYD', 'MG', 'KTM'];

function titleCaseMake(name: string): string {
  const upper = name.trim().toUpperCase();
  if (ACRONYMS.includes(upper)) return upper;

  return name
    .trim()
    .split(/(\s+|(?<=-)(?=\S)|(?<=\S)(?=-))/g)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '-') return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

// GET /api/admin/vehicle-makes — List all makes
// Optional ?category= filter (omit to return all categories)
// Optional ?active=true to filter only active makes
export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
  const category = request.nextUrl.searchParams.get('category');
  const admin = createAdminClient();

  let query = admin
    .from('vehicle_makes')
    .select('id, name, category, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ makes: data });
}

// POST /api/admin/vehicle-makes — Add a new make
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const rawName = body.name;
  const category = body.category || 'automobile';

  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const name = titleCaseMake(rawName);
  const admin = createAdminClient();

  // Check for case-insensitive duplicate within same category
  const { data: existing } = await admin
    .from('vehicle_makes')
    .select('id')
    .ilike('name', name)
    .eq('category', category)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `"${name}" already exists in ${category} category` },
      { status: 409 }
    );
  }

  // Get max sort_order within this category
  const { data: maxRow } = await admin
    .from('vehicle_makes')
    .select('sort_order')
    .eq('category', category)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await admin
    .from('vehicle_makes')
    .insert({ name, category, sort_order: nextSort })
    .select('id, name, category, is_active, sort_order')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ make: data }, { status: 201 });
}

// PATCH /api/admin/vehicle-makes — Update a make
export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, category, is_active, sort_order } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) {
    updates.name = titleCaseMake(name);
  }
  if (typeof category === 'string') {
    updates.category = category;
  }
  if (typeof is_active === 'boolean') {
    updates.is_active = is_active;
  }
  if (typeof sort_order === 'number') {
    updates.sort_order = sort_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('vehicle_makes')
    .update(updates)
    .eq('id', id)
    .select('id, name, category, is_active, sort_order')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A make with this name already exists in that category' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ make: data });
}

// DELETE /api/admin/vehicle-makes — Remove a make
export async function DELETE(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the make name first
  const { data: make } = await admin
    .from('vehicle_makes')
    .select('name')
    .eq('id', id)
    .single();

  if (!make) {
    return NextResponse.json({ error: 'Make not found' }, { status: 404 });
  }

  // Check if any vehicles reference this make name
  const { count } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .ilike('make', make.name);

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Cannot delete — vehicles exist with this make' },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from('vehicle_makes')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
