'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/supabase/types';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format';
import { PO_STATUS_LABELS, PO_STATUS_BADGE_VARIANT } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ArrowLeft, Send, PackageCheck, XCircle, Trash2 } from 'lucide-react';

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const poId = params.id as string;

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function loadPO() {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/purchase-orders/${poId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPo(json.data);
    } catch (err) {
      console.error('Load PO error:', err);
      toast.error('Failed to load purchase order');
      router.push('/admin/inventory/purchase-orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPO();
  }, [poId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(newStatus: 'ordered' | 'cancelled') {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(newStatus === 'ordered' ? 'Purchase order submitted' : 'Purchase order cancelled');
      setCancelOpen(false);
      await loadPO();
    } catch (err) {
      console.error('Status change error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setActing(false);
    }
  }

  async function handleReceive() {
    if (!po?.items) return;

    const receiveItems = po.items
      .filter((item) => (receiveQuantities[item.id] || 0) > 0)
      .map((item) => ({
        item_id: item.id,
        quantity_received: receiveQuantities[item.id] || 0,
      }));

    if (receiveItems.length === 0) {
      toast.error('Enter quantities for at least one item');
      return;
    }

    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/purchase-orders/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: receiveItems }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(json.data.fully_received ? 'All items received — PO complete!' : 'Items received');
      setReceiving(false);
      setReceiveQuantities({});
      await loadPO();
    } catch (err) {
      console.error('Receive error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to receive items');
    } finally {
      setActing(false);
    }
  }

  async function handleDelete() {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/purchase-orders/${poId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success('Purchase order deleted');
      router.push('/admin/inventory/purchase-orders');
    } catch (err) {
      console.error('Delete PO error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setActing(false);
      setDeleteOpen(false);
    }
  }

  function fillAllRemaining() {
    if (!po?.items) return;
    const quantities: Record<string, number> = {};
    for (const item of po.items) {
      const remaining = item.quantity_ordered - item.quantity_received;
      if (remaining > 0) {
        quantities[item.id] = remaining;
      }
    }
    setReceiveQuantities(quantities);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!po) return null;

  const total = (po.items ?? []).reduce(
    (sum, item) => sum + item.quantity_ordered * item.unit_cost,
    0
  );

  const totalReceived = (po.items ?? []).reduce(
    (sum, item) => sum + item.quantity_received * item.unit_cost,
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.po_number}
        description={`Purchase order for ${po.vendor?.name || 'Unknown vendor'}`}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/inventory/purchase-orders')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* Status + Actions Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Badge variant={PO_STATUS_BADGE_VARIANT[po.status] || 'default'} className="text-sm">
            {PO_STATUS_LABELS[po.status] || po.status}
          </Badge>
          {po.ordered_at && (
            <span className="text-sm text-gray-500">
              Ordered {formatDateTime(po.ordered_at)}
            </span>
          )}
          {po.received_at && (
            <span className="text-sm text-gray-500">
              Received {formatDateTime(po.received_at)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {po.status === 'draft' && (
            <>
              <Button
                size="sm"
                onClick={() => handleStatusChange('ordered')}
                disabled={acting}
              >
                <Send className="h-4 w-4" />
                Submit Order
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                disabled={acting}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </>
          )}
          {po.status === 'ordered' && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setReceiving(true);
                  fillAllRemaining();
                }}
                disabled={acting || receiving}
              >
                <PackageCheck className="h-4 w-4" />
                Receive Items
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCancelOpen(true)}
                disabled={acting}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* PO Info */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Vendor</div>
          <div className="font-semibold text-gray-900">{po.vendor?.name || '--'}</div>
          {po.vendor?.contact_name && (
            <div className="text-xs text-gray-500 mt-1">{po.vendor.contact_name}</div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total Cost</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Received Value</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalReceived)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Created</div>
          <div className="font-semibold text-gray-900">{formatDate(po.created_at)}</div>
          {po.created_by_employee && (
            <div className="text-xs text-gray-500 mt-1">
              by {po.created_by_employee.first_name} {po.created_by_employee.last_name}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-medium text-gray-500 mb-1">Notes</div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}

      {/* Items Table */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Items ({(po.items ?? []).length})
          </h3>
          {receiving && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={fillAllRemaining}>
                Fill All
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setReceiving(false); setReceiveQuantities({}); }}>
                Cancel Receive
              </Button>
              <Button size="sm" onClick={handleReceive} disabled={acting}>
                {acting ? 'Receiving...' : 'Confirm Receive'}
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium w-20">SKU</th>
                <th className="pb-2 font-medium w-20 text-right">Ordered</th>
                <th className="pb-2 font-medium w-20 text-right">Received</th>
                <th className="pb-2 font-medium w-24 text-right">Unit Cost</th>
                <th className="pb-2 font-medium w-24 text-right">Line Total</th>
                {receiving && <th className="pb-2 font-medium w-28 text-right">Receive Qty</th>}
              </tr>
            </thead>
            <tbody>
              {(po.items ?? []).map((item: PurchaseOrderItem) => {
                const remaining = item.quantity_ordered - item.quantity_received;
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{item.product?.name || '--'}</td>
                    <td className="py-2 font-mono text-xs text-gray-400">
                      {item.product?.sku || '--'}
                    </td>
                    <td className="py-2 text-right">{item.quantity_ordered}</td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          item.quantity_received >= item.quantity_ordered
                            ? 'text-green-600 font-medium'
                            : item.quantity_received > 0
                            ? 'text-yellow-600 font-medium'
                            : ''
                        }
                      >
                        {item.quantity_received}
                      </span>
                    </td>
                    <td className="py-2 text-right">{formatCurrency(item.unit_cost)}</td>
                    <td className="py-2 text-right font-medium">
                      {formatCurrency(item.quantity_ordered * item.unit_cost)}
                    </td>
                    {receiving && (
                      <td className="py-2 text-right">
                        {remaining > 0 ? (
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            value={receiveQuantities[item.id] || 0}
                            onChange={(e) =>
                              setReceiveQuantities((prev) => ({
                                ...prev,
                                [item.id]: Math.min(
                                  parseInt(e.target.value) || 0,
                                  remaining
                                ),
                              }))
                            }
                            className="w-20 ml-auto"
                          />
                        ) : (
                          <Badge variant="success" className="text-xs">Done</Badge>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Purchase Order"
        description={`Are you sure you want to delete ${po.po_number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={acting}
        onConfirm={handleDelete}
      />

      {/* Cancel Confirmation */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Purchase Order"
        description={`Are you sure you want to cancel ${po.po_number}? This cannot be undone.`}
        confirmLabel="Cancel Order"
        variant="destructive"
        loading={acting}
        onConfirm={() => handleStatusChange('cancelled')}
      />
    </div>
  );
}
