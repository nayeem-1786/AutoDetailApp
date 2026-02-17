import { Shippo } from 'shippo';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ShippingRate,
  ShippingAddress,
  ShippingParcel,
  ShippingSettings,
  CarrierAccountInfo,
  AddressValidationResult,
  ShippingLabelResult,
  TrackingResult,
  TrackingEvent,
} from '@/lib/utils/shipping-types';
import type { WeightUnitEnum } from 'shippo/models/components/weightunitenum.js';
import type { DistanceUnitEnum } from 'shippo/models/components/distanceunitenum.js';

// ---------------------------------------------------------------------------
// Get shipping settings (singleton)
// ---------------------------------------------------------------------------

export async function getShippingSettings(): Promise<ShippingSettings | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('shipping_settings')
    .select('*')
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    enabled_carriers: Array.isArray(data.enabled_carriers) ? data.enabled_carriers : [],
    enabled_service_levels: Array.isArray(data.enabled_service_levels) ? data.enabled_service_levels : [],
    default_parcel_length: Number(data.default_parcel_length),
    default_parcel_width: Number(data.default_parcel_width),
    default_parcel_height: Number(data.default_parcel_height),
    default_parcel_weight: Number(data.default_parcel_weight),
    handling_fee_amount: Number(data.handling_fee_amount),
  } as ShippingSettings;
}

// ---------------------------------------------------------------------------
// Initialize Shippo client
// ---------------------------------------------------------------------------

async function getShippoClient(): Promise<Shippo> {
  const settings = await getShippingSettings();
  if (!settings) throw new Error('Shipping settings not configured');

  const apiKey = settings.shippo_mode === 'live'
    ? settings.shippo_api_key_live
    : settings.shippo_api_key_test;

  if (!apiKey) {
    throw new Error(`Shippo ${settings.shippo_mode} API key not configured`);
  }

  return new Shippo({ apiKeyHeader: apiKey });
}

/** Create a Shippo client with a specific API key (for test connection) */
function getShippoClientWithKey(apiKey: string): Shippo {
  return new Shippo({ apiKeyHeader: apiKey });
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testShippoConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getShippoClientWithKey(apiKey);
    // Try listing carrier accounts — lightweight call to verify the key
    await client.carrierAccounts.list({ page: 1, results: 1 });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// List carrier accounts
// ---------------------------------------------------------------------------

export async function listCarrierAccounts(): Promise<CarrierAccountInfo[]> {
  const client = await getShippoClient();
  const result = await client.carrierAccounts.list({
    page: 1,
    results: 100,
    serviceLevels: true,
  });

  const accounts = result.results || [];
  return accounts.map((acct) => ({
    objectId: acct.objectId || '',
    carrier: acct.carrier || '',
    carrierName: String(acct.carrierName || acct.carrier || ''),
    accountId: acct.accountId || '',
    active: acct.active ?? true,
    isShippoAccount: acct.isShippoAccount ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Get shipping rates
// ---------------------------------------------------------------------------

function calculateHandlingFee(
  rateCents: number,
  feeType: string,
  feeAmount: number
): number {
  if (feeType === 'flat') return Math.round(feeAmount);
  if (feeType === 'percent') return Math.round(rateCents * (feeAmount / 100));
  return 0;
}

export async function getShippingRates(params: {
  addressTo: ShippingAddress;
  parcels: ShippingParcel[];
}): Promise<ShippingRate[]> {
  const settings = await getShippingSettings();
  if (!settings) throw new Error('Shipping settings not configured');

  const client = await getShippoClient();

  // Build parcels for Shippo
  const shippoParcels = params.parcels.map((p) => ({
    length: String(p.length),
    width: String(p.width),
    height: String(p.height),
    distanceUnit: p.distanceUnit as DistanceUnitEnum,
    weight: String(p.weight),
    massUnit: p.massUnit as WeightUnitEnum,
  }));

  // Create shipment to get rates (sync mode)
  const shipment = await client.shipments.create({
    addressFrom: {
      name: settings.ship_from_name,
      company: settings.ship_from_company || undefined,
      street1: settings.ship_from_street1,
      street2: settings.ship_from_street2 || undefined,
      city: settings.ship_from_city,
      state: settings.ship_from_state,
      zip: settings.ship_from_zip,
      country: settings.ship_from_country,
      phone: settings.ship_from_phone || undefined,
      email: settings.ship_from_email || undefined,
    },
    addressTo: {
      name: params.addressTo.name,
      company: params.addressTo.company || undefined,
      street1: params.addressTo.street1,
      street2: params.addressTo.street2 || undefined,
      city: params.addressTo.city,
      state: params.addressTo.state,
      zip: params.addressTo.zip,
      country: params.addressTo.country,
      phone: params.addressTo.phone || undefined,
      email: params.addressTo.email || undefined,
    },
    parcels: shippoParcels,
    async: false,
  });

  let rates = shipment.rates || [];

  // Filter to enabled carriers if any are set
  if (settings.enabled_carriers.length > 0) {
    rates = rates.filter((r) => {
      const carrierToken = r.servicelevel?.token?.split('_')[0] || r.provider?.toLowerCase() || '';
      return settings.enabled_carriers.some(
        (c) => carrierToken.startsWith(c.toLowerCase()) || r.provider?.toLowerCase().includes(c.toLowerCase())
      );
    });
  }

  // Filter to enabled service levels if any are set
  if (settings.enabled_service_levels.length > 0) {
    rates = rates.filter((r) => {
      const token = r.servicelevel?.token || '';
      return settings.enabled_service_levels.includes(token);
    });
  }

  // Map to our format
  const formattedRates: ShippingRate[] = rates.map((r) => {
    const amountCents = Math.round(parseFloat(r.amount) * 100);
    const handlingFee = calculateHandlingFee(
      amountCents,
      settings.handling_fee_type,
      settings.handling_fee_amount
    );

    return {
      id: r.objectId,
      carrier: r.servicelevel?.token?.split('_')[0] || r.provider?.toLowerCase() || '',
      carrierName: r.provider || '',
      carrierLogo: r.providerImage75 || undefined,
      service: r.servicelevel?.token || '',
      serviceName: r.servicelevel?.name || '',
      amount: amountCents,
      currency: r.currency || 'USD',
      estimatedDays: r.estimatedDays ?? null,
      handlingFee,
      totalAmount: amountCents + handlingFee,
    };
  });

  // Sort by price or speed
  if (settings.sort_rates_by === 'speed') {
    formattedRates.sort((a, b) => (a.estimatedDays ?? 999) - (b.estimatedDays ?? 999));
  } else {
    formattedRates.sort((a, b) => a.totalAmount - b.totalAmount);
  }

  return formattedRates;
}

// ---------------------------------------------------------------------------
// Create shipping label
// ---------------------------------------------------------------------------

export async function createShippingLabel(params: {
  rateId: string;
  orderId: string;
}): Promise<ShippingLabelResult> {
  const client = await getShippoClient();

  const transaction = await client.transactions.create({
    rate: params.rateId,
    async: false,
    metadata: `Order: ${params.orderId}`,
  });

  if (!transaction.labelUrl || !transaction.trackingNumber) {
    const msgs = transaction.messages?.map((m) => m.text).join(', ') || 'Label creation failed';
    throw new Error(msgs);
  }

  return {
    labelUrl: transaction.labelUrl,
    trackingNumber: transaction.trackingNumber,
    trackingUrl: transaction.trackingUrlProvider || '',
  };
}

// ---------------------------------------------------------------------------
// Track shipment
// ---------------------------------------------------------------------------

export async function trackShipment(params: {
  carrier: string;
  trackingNumber: string;
}): Promise<TrackingResult> {
  const client = await getShippoClient();

  const track = await client.trackingStatus.get(params.trackingNumber, params.carrier);

  const history: TrackingEvent[] = (track.trackingHistory || []).map((event) => ({
    status: String(event.status),
    statusDetails: event.statusDetails || '',
    statusDate: event.statusDate?.toISOString() || '',
    location: event.location ? {
      city: event.location.city || undefined,
      state: event.location.state || undefined,
      zip: event.location.zip || undefined,
      country: event.location.country || undefined,
    } : undefined,
  }));

  return {
    carrier: track.carrier,
    trackingNumber: track.trackingNumber,
    status: track.trackingStatus ? String(track.trackingStatus.status) : 'UNKNOWN',
    statusDetails: track.trackingStatus?.statusDetails || '',
    eta: track.eta?.toISOString(),
    trackingHistory: history,
  };
}

// ---------------------------------------------------------------------------
// Validate address
// ---------------------------------------------------------------------------

export async function validateAddress(address: {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}): Promise<AddressValidationResult> {
  const client = await getShippoClient();

  // Create address with validate flag
  const created = await client.addresses.create({
    street1: address.street1,
    street2: address.street2 || undefined,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    validate: true,
  });

  const validation = created.validationResults;
  const isValid = validation?.isValid ?? false;
  const messages = (validation?.messages || []).map((m) => m.text || '');

  return {
    isValid,
    messages,
    suggestedAddress: isValid ? {
      name: created.name || '',
      street1: created.street1 || address.street1,
      street2: created.street2 || undefined,
      city: created.city || address.city,
      state: created.state || address.state,
      zip: created.zip || address.zip,
      country: created.country || address.country,
    } : undefined,
  };
}
