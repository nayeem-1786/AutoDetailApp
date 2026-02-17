import { NextRequest, NextResponse } from 'next/server';
import { validateAddress } from '@/lib/services/shippo';

// POST — validate a shipping address via Shippo (non-blocking at checkout)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { street1, street2, city, state, zip, country } = body as {
      street1: string;
      street2?: string;
      city: string;
      state: string;
      zip: string;
      country?: string;
    };

    if (!street1 || !city || !state || !zip) {
      return NextResponse.json({ error: 'Address fields required' }, { status: 400 });
    }

    const result = await validateAddress({
      street1,
      street2,
      city,
      state,
      zip,
      country: country || 'US',
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[validate-address] Error:', err);
    // Return success with isValid true on error — validation is non-blocking
    return NextResponse.json({ data: { isValid: true, messages: [] } });
  }
}
