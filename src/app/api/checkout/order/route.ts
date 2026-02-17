import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('number');

  if (!orderNumber) {
    return NextResponse.json({ error: 'Order number required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from('orders')
    .select('order_number, email, first_name, subtotal, discount_amount, tax_amount, shipping_amount, total, coupon_code, fulfillment_method, payment_status, order_items:order_items(product_name, quantity, unit_price, line_total, product_image_url)')
    .eq('order_number', orderNumber)
    .single();

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
    items: order.order_items,
  });
}
