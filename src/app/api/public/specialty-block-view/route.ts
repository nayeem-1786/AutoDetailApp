import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/services/audit';

/**
 * POST /api/public/specialty-block-view
 *
 * Fires when the booking block page renders for an exotic/classic vehicle.
 * Measures the denominator: how often the gate fires.
 * The numerator (callback form submit) is tracked by specialty-callback.
 *
 * Session 29: payload switched from boolean flags to size_class (canonical taxonomy).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vehicle_year, vehicle_make, vehicle_model, size_class } = body as {
      vehicle_year?: number | null;
      vehicle_make?: string | null;
      vehicle_model?: string | null;
      size_class?: string | null;
    };

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = size_class === 'classic' ? 'classic' : 'exotic';

    logAudit({
      action: 'create',
      entityType: 'booking',
      entityLabel: `Booking blocked: ${vehicleWord} ${vehicleDesc}`,
      details: {
        event: 'booking_blocked_specialty_vehicle',
        vehicle_year,
        vehicle_make,
        vehicle_model,
        size_class: size_class ?? null,
        vehicle_type: vehicleWord,
      },
      source: 'api',
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail — best-effort tracking
  }
}
