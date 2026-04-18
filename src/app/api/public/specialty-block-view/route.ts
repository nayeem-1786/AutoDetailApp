import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/services/audit';

/**
 * POST /api/public/specialty-block-view
 *
 * Fires when the booking block page renders for an exotic/classic vehicle.
 * Measures the denominator: how often the gate fires.
 * The numerator (callback form submit) is tracked by specialty-callback.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vehicle_year, vehicle_make, vehicle_model, is_exotic, is_classic } = body as {
      vehicle_year?: number | null;
      vehicle_make?: string | null;
      vehicle_model?: string | null;
      is_exotic?: boolean;
      is_classic?: boolean;
    };

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = is_exotic && is_classic ? 'specialty' : is_exotic ? 'exotic' : 'classic';

    logAudit({
      action: 'create',
      entityType: 'booking',
      entityLabel: `Booking blocked: ${vehicleWord} ${vehicleDesc}`,
      details: {
        event: 'booking_blocked_specialty_vehicle',
        vehicle_year,
        vehicle_make,
        vehicle_model,
        is_exotic: is_exotic ?? false,
        is_classic: is_classic ?? false,
        vehicle_type: vehicleWord,
      },
      source: 'api',
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail — best-effort tracking
  }
}
