'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

interface Preferences {
  sms_consent: boolean;
  email_consent: boolean;
  notify_promotions: boolean;
  notify_loyalty: boolean;
}

export default function UnsubscribePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    async function fetchPrefs() {
      try {
        const res = await fetch(`/api/unsubscribe/${customerId}`);
        if (!res.ok) {
          setError('Unable to load preferences');
          return;
        }
        const json = await res.json();
        setPrefs(json.data);
      } catch {
        setError('Unable to load preferences');
      } finally {
        setLoading(false);
      }
    }
    fetchPrefs();
  }, [customerId]);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/unsubscribe/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        toast.error('Failed to save preferences');
        return;
      }
      setSaved(true);
      toast.success('Preferences updated');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  function handleUnsubscribeAll() {
    setPrefs({
      sms_consent: false,
      email_consent: false,
      notify_promotions: false,
      notify_loyalty: false,
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !prefs) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Link Expired</h1>
          <p className="mt-2 text-sm text-gray-600">
            This unsubscribe link is no longer valid.
          </p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-sm text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Preferences Updated</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your notification preferences have been saved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Notification Preferences</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage how we communicate with you.
        </p>

        {/* Communication Channels */}
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Communication Channels
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">SMS Messages</p>
              <p className="text-xs text-gray-500">Receive messages via text</p>
            </div>
            <Switch
              checked={prefs.sms_consent}
              onCheckedChange={(val) => setPrefs({ ...prefs, sms_consent: val })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Email Messages</p>
              <p className="text-xs text-gray-500">Receive messages via email</p>
            </div>
            <Switch
              checked={prefs.email_consent}
              onCheckedChange={(val) => setPrefs({ ...prefs, email_consent: val })}
            />
          </div>
        </div>

        {/* Notification Types */}
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Notification Types
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Appointment Reminders</p>
              <p className="text-xs text-gray-500">Booking confirmations and reminders</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Required</span>
              <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Service Updates</p>
              <p className="text-xs text-gray-500">Status updates and completion notices</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Required</span>
              <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Promotions & Offers</p>
              <p className="text-xs text-gray-500">Special deals and discount codes</p>
            </div>
            <Switch
              checked={prefs.notify_promotions}
              onCheckedChange={(val) => setPrefs({ ...prefs, notify_promotions: val })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Loyalty Updates</p>
              <p className="text-xs text-gray-500">Points earned and reward notifications</p>
            </div>
            <Switch
              checked={prefs.notify_loyalty}
              onCheckedChange={(val) => setPrefs({ ...prefs, notify_loyalty: val })}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
          <Button
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleUnsubscribeAll}
          >
            Unsubscribe from All
          </Button>
        </div>
      </div>
    </div>
  );
}
