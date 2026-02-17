import { NextRequest, NextResponse } from 'next/server';
import { getShippingRates, getShippingSettings } from '@/lib/services/shippo';
import type { ShippingRate, ShippingParcel } from '@/lib/utils/shipping-types';
import { createAdminClient } from '@/lib/supabase/admin';

interface CartItem {
  productId: string;
  quantity: number;
}

// POST — get shipping rates for checkout
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { shippingAddress, items } = body as {
    shippingAddress: {
      name: string;
      street1: string;
      street2?: string;
      city: string;
      state: string;
      zip: string;
      country?: string;
      phone?: string;
      email?: string;
    };
    items: CartItem[];
  };

  if (!shippingAddress?.street1 || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.zip) {
    return NextResponse.json({ error: 'Valid shipping address required' }, { status: 400 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Cart items required' }, { status: 400 });
  }

  try {
    const settings = await getShippingSettings();
    if (!settings) {
      return NextResponse.json({ error: 'Shipping not configured' }, { status: 500 });
    }

    const rates: ShippingRate[] = [];

    // Check if flat rate is enabled — skip Shippo call
    if (settings.flat_rate_enabled && settings.flat_rate_amount > 0) {
      rates.push({
        id: 'flat_rate',
        carrier: 'flat_rate',
        carrierName: 'Standard Shipping',
        service: 'flat_rate',
        serviceName: 'Flat Rate Shipping',
        amount: settings.flat_rate_amount,
        currency: 'USD',
        estimatedDays: null,
        handlingFee: 0,
        totalAmount: settings.flat_rate_amount,
      });
    } else {
      // Build parcels from cart items
      const parcels = await buildParcels(items, settings);

      // Get rates from Shippo
      const shippoRates = await getShippingRates({
        addressTo: {
          name: shippingAddress.name,
          street1: shippingAddress.street1,
          street2: shippingAddress.street2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          zip: shippingAddress.zip,
          country: shippingAddress.country || 'US',
          phone: shippingAddress.phone,
          email: shippingAddress.email,
        },
        parcels,
      });

      rates.push(...shippoRates);
    }

    // Check for free shipping eligibility
    let freeShippingEligible = false;
    if (settings.offer_free_shipping && settings.free_shipping_threshold > 0) {
      // Calculate cart subtotal
      const supabase = createAdminClient();
      let subtotalCents = 0;
      for (const item of items) {
        const { data: product } = await supabase
          .from('products')
          .select('retail_price')
          .eq('id', item.productId)
          .single();
        if (product) {
          subtotalCents += Math.round(Number(product.retail_price) * 100) * item.quantity;
        }
      }

      if (subtotalCents >= settings.free_shipping_threshold) {
        freeShippingEligible = true;
        rates.unshift({
          id: 'free_shipping',
          carrier: 'free',
          carrierName: 'Free Shipping',
          service: 'free_shipping',
          serviceName: 'Free Standard Shipping',
          amount: 0,
          currency: 'USD',
          estimatedDays: null,
          handlingFee: 0,
          totalAmount: 0,
        });
      }
    }

    // Add local pickup option if enabled
    if (settings.local_pickup_enabled) {
      rates.push({
        id: 'local_pickup',
        carrier: 'pickup',
        carrierName: 'Local Pickup',
        service: 'local_pickup',
        serviceName: 'Local Pickup',
        amount: 0,
        currency: 'USD',
        estimatedDays: 0,
        handlingFee: 0,
        totalAmount: 0,
      });
    }

    return NextResponse.json({
      data: {
        rates,
        freeShippingEligible,
        freeShippingThreshold: settings.offer_free_shipping ? settings.free_shipping_threshold : null,
        localPickupAddress: settings.local_pickup_enabled ? settings.local_pickup_address : null,
        localPickupInstructions: settings.local_pickup_enabled ? settings.local_pickup_instructions : null,
        showEstimatedDelivery: settings.show_estimated_delivery,
        showCarrierLogo: settings.show_carrier_logo,
      },
    });
  } catch (err) {
    console.error('[shipping-rates] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to calculate shipping rates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function buildParcels(
  items: CartItem[],
  settings: NonNullable<Awaited<ReturnType<typeof getShippingSettings>>>
): Promise<ShippingParcel[]> {
  const supabase = createAdminClient();

  // Fetch product dimensions
  const productIds = items.map((i) => i.productId);
  const { data: products } = await supabase
    .from('products')
    .select('id, weight, length, width, height, weight_unit, dimension_unit')
    .in('id', productIds);

  const productMap = new Map(
    (products || []).map((p) => [p.id, p])
  );

  // For simplicity, combine all items into one parcel using defaults
  // A more advanced approach would bin-pack items into multiple parcels
  let totalWeight = 0;
  let maxLength = settings.default_parcel_length;
  let maxWidth = settings.default_parcel_width;
  let maxHeight = settings.default_parcel_height;

  for (const item of items) {
    const product = productMap.get(item.productId);
    const qty = item.quantity;

    if (product?.weight) {
      totalWeight += Number(product.weight) * qty;
    } else {
      totalWeight += settings.default_parcel_weight * qty;
    }

    if (product?.length && Number(product.length) > maxLength) maxLength = Number(product.length);
    if (product?.width && Number(product.width) > maxWidth) maxWidth = Number(product.width);
    if (product?.height) maxHeight = Math.max(maxHeight, Number(product.height) * qty);
  }

  // Ensure minimum weight
  if (totalWeight <= 0) totalWeight = settings.default_parcel_weight;

  return [{
    length: maxLength,
    width: maxWidth,
    height: maxHeight,
    distanceUnit: settings.default_parcel_distance_unit,
    weight: totalWeight,
    massUnit: settings.default_parcel_mass_unit,
  }];
}
