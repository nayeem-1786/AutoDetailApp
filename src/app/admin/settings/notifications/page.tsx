'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { NotificationRecipient } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Bell, Clock, Info, Loader2, Plus, Trash2 } from 'lucide-react';

type NotificationType = 'low_stock' | 'all';

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState<NotificationType>('low_stock');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRecipient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [businessEmail, setBusinessEmail] = useState<string | null>(null);

  async function loadRecipients() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/notification-recipients');
      const json = await res.json();
      if (res.ok) {
        setRecipients(json.data ?? []);
      }
    } catch (err) {
      console.error('Failed to load recipients:', err);
    }
    setLoading(false);
  }

  async function loadBusinessEmail() {
    try {
      const res = await fetch('/api/public/business-info');
      const json = await res.json();
      if (json.email) {
        setBusinessEmail(json.email);
      }
    } catch {
      // Ignore — not critical
    }
  }

  useEffect(() => {
    loadRecipients();
    loadBusinessEmail();
  }, []);

  // Auto-populate email field when there are zero recipients and we have a business email
  useEffect(() => {
    if (!loading && recipients.length === 0 && businessEmail && !showAddForm) {
      setNewEmail(businessEmail);
      setShowAddForm(true);
    }
  }, [loading, recipients.length, businessEmail, showAddForm]);

  async function handleAdd() {
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }

    setAdding(true);
    try {
      const res = await adminFetch('/api/admin/notification-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), notification_type: newType }),
      });

      const json = await res.json();

      if (res.status === 409) {
        toast.error('This email is already registered for this notification type');
      } else if (!res.ok) {
        toast.error(json.error || 'Failed to add recipient');
      } else {
        toast.success('Recipient added');
        setNewEmail('');
        setNewType('low_stock');
        setShowAddForm(false);
        loadRecipients();
      }
    } catch {
      toast.error('Failed to add recipient');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(recipient: NotificationRecipient) {
    setTogglingId(recipient.id);
    try {
      const res = await adminFetch(`/api/admin/notification-recipients/${recipient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !recipient.is_active }),
      });

      if (res.ok) {
        setRecipients((prev) =>
          prev.map((r) =>
            r.id === recipient.id ? { ...r, is_active: !r.is_active } : r
          )
        );
      } else {
        toast.error('Failed to update recipient');
      }
    } catch {
      toast.error('Failed to update recipient');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const res = await adminFetch(`/api/admin/notification-recipients/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Recipient removed');
        setRecipients((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        toast.error('Failed to delete recipient');
      }
    } catch {
      toast.error('Failed to delete recipient');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Configure who receives alerts and notifications."
        action={
          <Button variant="outline" onClick={() => router.push('/admin/settings')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* Stock Alert Recipients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Stock Alert Recipients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            These email addresses will receive daily stock alerts when products fall below their reorder threshold.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {recipients.length > 0 ? (
                <div className="mb-4 overflow-hidden rounded-lg border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Active</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-4 py-3 text-sm text-gray-900">{r.email}</td>
                          <td className="px-4 py-3">
                            <Badge variant={r.notification_type === 'all' ? 'info' : 'warning'}>
                              {r.notification_type === 'all' ? 'All' : 'Low Stock'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={r.is_active}
                                onCheckedChange={() => handleToggle(r)}
                                disabled={togglingId === r.id}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(r)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !showAddForm ? (
                <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <Bell className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-sm text-gray-500">
                    No recipients configured. Add an email address to start receiving stock alerts.
                  </p>
                </div>
              ) : null}

              {/* Add Recipient Form */}
              {showAddForm ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h4 className="mb-3 text-sm font-medium text-gray-900">Add Recipient</h4>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-600">Email Address</label>
                      <Input
                        type="email"
                        placeholder="name@example.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdd();
                          }
                        }}
                      />
                    </div>
                    <div className="w-full sm:w-48">
                      <label className="mb-1 block text-xs font-medium text-gray-600">Alert Type</label>
                      <Select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as NotificationType)}
                      >
                        <option value="low_stock">Low Stock Alerts</option>
                        <option value="all">All Notifications</option>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAdd} disabled={adding}>
                        {adding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Add
                      </Button>
                      <Button variant="outline" onClick={() => { setShowAddForm(false); setNewEmail(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4" />
                  Add Recipient
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Alert Schedule (informational) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Alert Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p>Stock alerts are sent daily at 8:00 AM PST when products are below their reorder threshold.</p>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p>Products are only re-alerted when stock levels change or after 7 days.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Recipient</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to remove <strong>{deleteTarget?.email}</strong> from stock alert notifications?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
