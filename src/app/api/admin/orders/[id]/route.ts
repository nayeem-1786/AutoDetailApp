import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendFulfillmentEmail } from '@/lib/utils/order-emails';
import { logAudit, getRequestIp, buildChangeDetails } from '@/lib/services/audit';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const denied = await requirePermission(employee.id, 'orders.view');
    if (denied) return denied;

    const { id } = await params;
    const admin = createAdminClient();

    // Fetch order with items and events
    const { data: order, error } = await admin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch events
    const { data: events } = await admin
      .from('order_events')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false });

    // Fetch customer if linked
    let customer = null;
    if (order.customer_id) {
      const { data } = await admin
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .eq('id', order.customer_id)
        .single();
      customer = data;
    }

    // Resolve event creator names
    const creatorIds = (events || [])
      .filter((e) => e.created_by)
      .map((e) => e.created_by as string);
    const uniqueCreatorIds = [...new Set(creatorIds)];
    const creatorMap = new Map<string, string>();
    if (uniqueCreatorIds.length > 0) {
      const { data: creators } = await admin
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', uniqueCreatorIds);
      for (const c of creators || []) {
        creatorMap.set(c.id, `${c.first_name} ${c.last_name}`);
      }
    }

    const enrichedEvents = (events || []).map((e) => ({
      ...e,
      created_by_name: e.created_by ? creatorMap.get(e.created_by) || null : null,
    }));

    return NextResponse.json({
      ...order,
      events: enrichedEvents,
      customer,
    });
  } catch (err) {
    console.error('[admin/orders/[id]] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const denied = await requirePermission(employee.id, 'orders.manage');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();

    // Fetch current order
    const { data: order, error: fetchError } = await admin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const events: Array<{ event_type: string; description: string; metadata?: Record<string, unknown> }> = [];
    const oldFulfillment = order.fulfillment_status;

    // Fulfillment status update
    if (body.fulfillment_status && body.fulfillment_status !== order.fulfillment_status) {
      updates.fulfillment_status = body.fulfillment_status;
      events.push({
        event_type: 'fulfillment_updated',
        description: `Fulfillment status changed from ${order.fulfillment_status} to ${body.fulfillment_status}`,
        metadata: { from: order.fulfillment_status, to: body.fulfillment_status },
      });
    }

    // Tracking info
    if (body.tracking_number !== undefined) {
      updates.tracking_number = body.tracking_number || null;
      if (body.tracking_number) {
        events.push({
          event_type: 'tracking_updated',
          description: `Tracking number updated: ${body.tracking_number}`,
        });
      }
    }
    if (body.tracking_url !== undefined) {
      updates.tracking_url = body.tracking_url || null;
    }
    if (body.shipping_carrier !== undefined) {
      updates.shipping_carrier = body.shipping_carrier || null;
    }

    // Internal notes
    if (body.internal_notes !== undefined) {
      updates.internal_notes = body.internal_notes;
      if (body.internal_notes !== order.internal_notes) {
        events.push({
          event_type: 'note_added',
          description: 'Internal notes updated',
        });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    // Apply updates
    const { data: updated, error: updateError } = await admin
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select('*, order_items(*)')
      .single();

    if (updateError) throw updateError;

    // Insert events
    if (events.length > 0) {
      await admin.from('order_events').insert(
        events.map((e) => ({
          order_id: id,
          event_type: e.event_type,
          description: e.description,
          metadata: e.metadata || null,
          created_by: employee.id,
        }))
      );
    }

    // Fire-and-forget email on fulfillment status change
    if (body.fulfillment_status && body.fulfillment_status !== oldFulfillment) {
      sendFulfillmentEmail(updated, body.fulfillment_status).catch((err) =>
        console.error('[order email] Error:', err)
      );
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'update',
      entityType: 'order',
      entityId: id,
      entityLabel: `Order #${id.slice(0, 8)}`,
      details: buildChangeDetails(order, updated, ['fulfillment_status', 'tracking_number', 'tracking_url', 'shipping_carrier', 'internal_notes']),
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[admin/orders/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
