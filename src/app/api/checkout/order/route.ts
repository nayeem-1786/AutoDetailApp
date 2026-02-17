import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ORDER_SELECT =
  'order_number, email, first_name, subtotal, discount_amount, tax_amount, shipping_amount, total, coupon_code, fulfillment_method, payment_status, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, shipping_carrier, shipping_service, order_items:order_items(product_name, quantity, unit_price, line_total, product_image_url)';

export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('number');
  const orderId = request.nextUrl.searchParams.get('id');

  if (!orderNumber && !orderId) {
    return NextResponse.json(
      { error: 'Order number or id required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let query = admin.from('orders').select(ORDER_SELECT);

  if (orderId) {
    query = query.eq('id', orderId);
  } else {
    query = query.eq('order_number', orderNumber!);
  }

  const { data: order, error } = await query.single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json({
    order_number: order.order_number,
    email: order.email,
    first_name: order.first_name,
    subtotal: order.subtotal,
    discount_amount: order.discount_amount,
    tax_amount: order.tax_amount,
    shipping_amount: order.shipping_amount,
    total: order.total,
    coupon_code: order.coupon_code,
    fulfillment_method: order.fulfillment_method,
    payment_status: order.payment_status,
    shipping_address_line1: order.shipping_address_line1,
    shipping_address_line2: order.shipping_address_line2,
    shipping_city: order.shipping_city,
    shipping_state: order.shipping_state,
    shipping_zip: order.shipping_zip,
    shipping_carrier: order.shipping_carrier,
    shipping_service: order.shipping_service,
    items: order.order_items,
  });
}
