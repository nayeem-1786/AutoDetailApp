import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

// ---------------------------------------------------------------------------
// Vehicle count — baseline + completed jobs since cutoff
//
// Baseline represents historical vehicles serviced before the cutoff date.
// New completed jobs from the POS increment the count automatically.
// Override via business_settings keys: vehicle_count_baseline,
// vehicle_count_baseline_date.
// ---------------------------------------------------------------------------

const DEFAULT_BASELINE = 3816;
const DEFAULT_CUTOFF = '2026-01-01';

async function fetchVehicleCount(): Promise<number> {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    supabase = createAnonClient();
  }

  // Read optional overrides from business_settings
  const { data: settings } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['vehicle_count_baseline', 'vehicle_count_baseline_date']);

  let baseline = DEFAULT_BASELINE;
  let cutoff = DEFAULT_CUTOFF;

  for (const row of settings ?? []) {
    if (row.key === 'vehicle_count_baseline') {
      baseline = parseInt(String(row.value), 10) || DEFAULT_BASELINE;
    }
    if (row.key === 'vehicle_count_baseline_date') {
      cutoff = String(row.value) || DEFAULT_CUTOFF;
    }
  }

  // Count completed jobs since cutoff
  const { count } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('work_completed_at', cutoff);

  return baseline + (count ?? 0);
}

export const getVehicleCount = cache(fetchVehicleCount);
