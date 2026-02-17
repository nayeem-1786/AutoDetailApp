import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils/order-number';
import { TAX_RATE } from '@/lib/utils/constants';
import {
  calculateCouponDiscount,
  type CartItem as CouponCartItem,
  type CouponRow,
} from '@/lib/utils/coupon-helpers';
import { getShippingSettings } from '@/lib/services/shippo';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutItem {
  id: string;
  quantity: number;
}

interface ContactInfo {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      items,
      couponCode,
      contact,
      fulfillmentMethod = 'pickup',
      customerNotes,
      shippingAddress,
      shippoRateId,
      shippingAmountCents,
      shippingCarrier,
      shippingService,
    } = body as {
      items: CheckoutItem[];
      couponCode?: string;
      contact: ContactInfo;
      fulfillmentMethod?: 'pickup' | 'shipping';
      customerNotes?: string;
      shippingAddress?: ShippingAddress;
      shippoRateId?: string;
      shippingAmountCents?: number;
      shippingCarrier?: string;
      shippingService?: string;
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    if (!contact?.email || !contact?.firstName || !contact?.lastName) {
      return NextResponse.json(
        { error: 'Contact information is required' },
        { status: 400 }
      );
    }

    if (
      fulfillmentMethod === 'shipping' &&
      (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.zip)
    ) {
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Server-side price validation — re-fetch products from DB
    const productIds = items.map((i) => i.id);
    const { data: products, error: prodError } = await admin
      .from('products')
      .select('id, name, slug, retail_price, quantity_on_hand, is_active, is_taxable, category_id, image_url, product_categories(slug)')
      .in('id', productIds)
      .eq('is_active', true);

    if (prodError || !products) {
      return NextResponse.json(
        { error: 'Failed to validate products' },
        { status: 500 }
      );
    }

    // Check all requested products exist and are active
    const productMap = new Map(products.map((p) => [p.id, p]));
    const validatedItems: Array<{
      productId: string;
      name: string;
      slug: string;
      categorySlug: string;
      imageUrl: string | null;
      unitPriceCents: number;
      quantity: number;
      lineTotalCents: number;
      isTaxable: boolean;
    }> = [];

    const stockErrors: string[] = [];

    for (const item of items) {
      const product = productMap.get(item.id);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found or inactive: ${item.id}` },
          { status: 400 }
        );
      }

      if (item.quantity > product.quantity_on_hand) {
        stockErrors.push(
          `${product.name}: only ${product.quantity_on_hand} available`
        );
        continue;
      }

      if (item.quantity <= 0) {
        return NextResponse.json(
          { error: `Invalid quantity for ${product.name}` },
          { status: 400 }
        );
      }

      const unitPriceCents = Math.round(product.retail_price * 100);
      const categorySlug =
        (product.product_categories as unknown as { slug: string })?.slug ?? '';

      validatedItems.push({
        productId: product.id,
        name: product.name,
        slug: product.slug,
        categorySlug,
        imageUrl: product.image_url,
        unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: unitPriceCents * item.quantity,
        isTaxable: product.is_taxable,
      });
    }

    if (stockErrors.length > 0) {
      return NextResponse.json(
        { error: 'Stock issues', stockErrors },
        { status: 409 }
      );
    }

    // 2. Calculate subtotal (cents)
    const subtotalCents = validatedItems.reduce(
      (sum, i) => sum + i.lineTotalCents,
      0
    );

    // 3. Coupon validation
    let discountCents = 0;
    let couponId: string | null = null;
    let resolvedCouponCode: string | null = null;

    if (couponCode) {
      const { data: coupon } = await admin
        .from('coupons')
        .select('*, coupon_rewards(*)')
        .eq('code', couponCode.toUpperCase().trim())
        .eq('status', 'active')
        .single();

      if (coupon) {
        const now = new Date();
        const expired =
          coupon.expires_at && new Date(coupon.expires_at) < now;
        const maxUsesReached =
          coupon.max_uses != null && coupon.use_count >= coupon.max_uses;

        if (!expired && !maxUsesReached) {
          // Build cart items for coupon evaluation
          const couponItems: CouponCartItem[] = validatedItems.map((vi) => ({
            item_type: 'product' as const,
            product_id: vi.productId,
            category_id:
              products.find((p) => p.id === vi.productId)?.category_id ??
              undefined,
            unit_price: vi.unitPriceCents / 100, // coupon helpers use dollars
            quantity: vi.quantity,
            item_name: vi.name,
          }));

          const subtotalDollars = subtotalCents / 100;
          const discountDollars = calculateCouponDiscount(
            (coupon as unknown as CouponRow).coupon_rewards,
            couponItems,
            subtotalDollars
          );
          discountCents = Math.round(discountDollars * 100);
          couponId = coupon.id;
          resolvedCouponCode = coupon.code;
        }
      }
    }

    // 4. Tax — destination-based (CA only)
    // Determine tax state: for shipping use shipping address, for pickup use business state
    let taxState: string | null = null;
    if (fulfillmentMethod === 'shipping' && shippingAddress?.state) {
      taxState = shippingAddress.state.toUpperCase().trim();
    } else if (fulfillmentMethod === 'pickup') {
      // Use business state (ship-from state from shipping settings)
      const shippingSettings = await getShippingSettings();
      taxState = shippingSettings?.ship_from_state?.toUpperCase().trim() ?? 'CA';
    }

    let taxCents = 0;
    if (taxState === 'CA') {
      const taxableSubtotalCents = validatedItems
        .filter((i) => i.isTaxable)
        .reduce((sum, i) => sum + i.lineTotalCents, 0);

      const discountRatio =
        subtotalCents > 0 ? discountCents / subtotalCents : 0;
      const taxableAfterDiscountCents = Math.round(
        taxableSubtotalCents * (1 - discountRatio)
      );
      taxCents = Math.round(taxableAfterDiscountCents * TAX_RATE);
    }

    // 5. Shipping
    let shippingCents = 0;
    if (fulfillmentMethod === 'shipping' && shippingAmountCents != null) {
      shippingCents = Math.max(0, Math.round(shippingAmountCents));
    }

    // 6. Total
    const totalCents = subtotalCents - discountCents + taxCents + shippingCents;

    if (totalCents < 50) {
      // Stripe minimum $0.50
      return NextResponse.json(
        { error: 'Order total is too low for payment processing' },
        { status: 400 }
      );
    }

    // 7. Check for logged-in customer
    let customerId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: cust } = await admin
          .from('customers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (cust) customerId = cust.id;
      }
    } catch {
      // Not authenticated — guest checkout
    }

    // 8. Generate order number & create order
    const orderNumber = await generateOrderNumber(admin);

    const orderData: Record<string, unknown> = {
      order_number: orderNumber,
      customer_id: customerId,
      email: contact.email,
      phone: contact.phone || null,
      first_name: contact.firstName,
      last_name: contact.lastName,
      subtotal: subtotalCents,
      discount_amount: discountCents,
      tax_amount: taxCents,
      shipping_amount: shippingCents,
      total: totalCents,
      coupon_id: couponId,
      coupon_code: resolvedCouponCode,
      fulfillment_method: fulfillmentMethod,
      customer_notes: customerNotes || null,
      payment_status: 'pending',
      fulfillment_status: 'unfulfilled',
    };

    // Add shipping details
    if (fulfillmentMethod === 'shipping' && shippingAddress) {
      orderData.shipping_address_line1 = shippingAddress.line1;
      orderData.shipping_address_line2 = shippingAddress.line2 || null;
      orderData.shipping_city = shippingAddress.city;
      orderData.shipping_state = shippingAddress.state;
      orderData.shipping_zip = shippingAddress.zip;
      orderData.shippo_rate_id = shippoRateId || null;
      orderData.shipping_carrier = shippingCarrier || null;
      orderData.shipping_service = shippingService || null;
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert(orderData)
      .select('id, order_number')
      .single();

    if (orderError || !order) {
      console.error('Order creation failed:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    // 9. Create order items
    const orderItems = validatedItems.map((vi) => ({
      order_id: order.id,
      product_id: vi.productId,
      product_name: vi.name,
      product_slug: vi.slug,
      category_slug: vi.categorySlug,
      product_image_url: vi.imageUrl,
      unit_price: vi.unitPriceCents,
      quantity: vi.quantity,
      line_total: vi.lineTotalCents,
    }));

    const { error: itemsError } = await admin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Order items creation failed:', itemsError);
      // Clean up the order
      await admin.from('orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: 'Failed to create order items' },
        { status: 500 }
      );
    }

    // 10. Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      capture_method: 'automatic',
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        customer_id: customerId || '',
      },
    });

    // 11. Update order with PI id
    await admin
      .from('orders')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', order.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      orderNumber: order.order_number,
      totals: {
        subtotal: subtotalCents,
        discount: discountCents,
        tax: taxCents,
        shipping: shippingCents,
        total: totalCents,
      },
    });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { error: 'Checkout failed' },
      { status: 500 }
    );
  }
}
