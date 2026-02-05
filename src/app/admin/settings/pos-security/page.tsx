'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Info, Plus, Globe, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';

// IPv4: 192.168.1.1
const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// IPv6: 2001:0db8:85a3::8a2e:0370:7334 (full or compressed)
const IPV6_REGEX =
  /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;

export default function PosSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [ips, setIps] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    async function load() {
      // Fetch current public IP
      try {
        const ipRes = await fetch('/api/admin/current-ip');
        if (ipRes.ok) {
          const { ip } = await ipRes.json();
          setCurrentIp(ip);
        }
      } catch {
        // Ignore errors fetching current IP
      }

      // Fetch saved settings
      const supabase = createClient();
      const { data } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['pos_allowed_ips', 'pos_ip_whitelist_enabled']);

      const settings: Record<string, unknown> = {};
      for (const row of data ?? []) {
        settings[row.key] = row.value;
      }

      const savedIps = Array.isArray(settings.pos_allowed_ips) ? settings.pos_allowed_ips : [];
      setIps(savedIps);
      setEnabled(settings.pos_ip_whitelist_enabled === true);
      setLoading(false);
    }
    load();
  }, []);

  // Auto-save toggle immediately when changed
  async function handleToggleChange(newEnabled: boolean) {
    // Don't allow enabling with no IPs
    const cleanIps = ips.map((ip) => ip.trim()).filter(Boolean);
    if (newEnabled && cleanIps.length === 0) {
      toast.error('Add at least one IP address before enabling restrictions');
      return;
    }

    setEnabled(newEnabled);

    const supabase = createClient();
    const { error } = await supabase.from('business_settings').upsert(
      {
        key: 'pos_ip_whitelist_enabled',
        value: newEnabled as unknown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (error) {
      toast.error('Failed to save', { description: error.message });
      setEnabled(!newEnabled); // Revert on error
      return;
    }

    toast.success(newEnabled ? 'IP restrictions enabled' : 'IP restrictions disabled');
  }

  function validateIp(value: string): string | null {
    if (!value.trim()) return null; // Allow empty
    const trimmed = value.trim();
    if (IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed)) {
      return null;
    }
    return 'Enter a valid IP address (IPv4 or IPv6)';
  }

  function handleIpChange(index: number, value: string) {
    const newIps = [...ips];
    newIps[index] = value;
    setIps(newIps);

    // Validate
    const error = validateIp(value);
    setErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[index] = error;
      } else {
        delete next[index];
      }
      return next;
    });
  }

  function addIpField() {
    setIps([...ips, '']);
  }

  function removeIp(index: number) {
    const newIps = ips.filter((_, i) => i !== index);
    setIps(newIps);
    // Rebuild errors with adjusted indices
    setErrors((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const oldIndex = parseInt(key, 10);
        if (oldIndex < index) {
          next[oldIndex] = value;
        } else if (oldIndex > index) {
          next[oldIndex - 1] = value;
        }
      });
      return next;
    });
  }

  function addCurrentIp() {
    if (!currentIp || currentIp === 'unknown') return;

    // Check if already added
    if (ips.includes(currentIp)) {
      toast.info('This IP is already in the whitelist');
      return;
    }

    setIps([...ips, currentIp]);
  }

  async function handleSave() {
    // Validate all
    const newErrors: Record<number, string> = {};
    ips.forEach((ip, index) => {
      const error = validateIp(ip);
      if (error) newErrors[index] = error;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix validation errors');
      return;
    }

    // Filter empty and trim
    const cleanIps = ips.map((ip) => ip.trim()).filter(Boolean);

    // Warn if enabling with no IPs
    if (enabled && cleanIps.length === 0) {
      toast.error('Add at least one IP address before enabling restrictions');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Save both settings
    const { error: ipsError } = await supabase.from('business_settings').upsert(
      {
        key: 'pos_allowed_ips',
        value: cleanIps as unknown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    const { error: enabledError } = await supabase.from('business_settings').upsert(
      {
        key: 'pos_ip_whitelist_enabled',
        value: enabled as unknown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (ipsError || enabledError) {
      toast.error('Failed to save', { description: ipsError?.message || enabledError?.message });
      setSaving(false);
      return;
    }

    toast.success(enabled ? 'IP restrictions enabled' : 'Settings saved');
    setIps(cleanIps);
    setSaving(false);
  }

  // Count valid IPs (non-empty, trimmed)
  const currentClean = ips.map((ip) => ip.trim()).filter(Boolean);
  const hasValidIps = currentClean.length > 0;

  // Check if any non-empty IP has a validation error
  const hasErrors = ips.some((ip, index) => ip.trim() && errors[index]);

  const isCurrentIpAdded = currentIp && currentIp !== 'unknown' && ips.includes(currentIp);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS Security"
          description="Manage IP whitelist for POS access restriction."
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS Security"
        description="Restrict POS access to specific IP addresses."
      />

      {/* Enable/Disable Toggle Card */}
      <Card className={enabled ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {enabled ? (
                <ShieldCheck className="h-6 w-6 text-green-600" />
              ) : (
                <ShieldOff className="h-6 w-6 text-gray-400" />
              )}
              <div>
                <p className={`font-medium ${enabled ? 'text-green-900' : 'text-gray-900'}`}>
                  IP Restriction {enabled ? 'Enabled' : 'Disabled'}
                </p>
                <p className={`text-sm ${enabled ? 'text-green-700' : 'text-gray-500'}`}>
                  {enabled
                    ? 'Only whitelisted IP addresses can access the POS system'
                    : 'Anyone can access the POS system from any location'}
                </p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggleChange} />
          </div>

          {/* Status explanation */}
          <div className={`mt-4 rounded-lg p-3 ${enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
            {enabled ? (
              <div className="text-sm text-green-800">
                <p className="font-medium">What happens when enabled:</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li>Only devices from whitelisted IPs can access <code className="rounded bg-green-200 px-1">/pos</code></li>
                  <li>All other IP addresses will see an access denied message</li>
                  <li>Works in both development and production environments</li>
                  <li>Make sure your current IP is whitelisted to avoid lockout</li>
                </ul>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                <p className="font-medium">What happens when disabled:</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li>The POS system is accessible from any IP address</li>
                  <li>No location-based restrictions are applied</li>
                  <li>Anyone with the URL can access the POS login page</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current IP Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Your public IP address</p>
              <p className="font-mono text-sm text-blue-700">
                {currentIp === 'unknown' ? 'Could not detect' : currentIp || 'Detecting...'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCurrentIp}
            disabled={!currentIp || currentIp === 'unknown' || isCurrentIpAdded}
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add My IP
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IP Whitelist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-500">
            Add the public IP addresses that should be allowed to access the POS system.
            You can find a location&apos;s public IP by visiting{' '}
            <a
              href="https://whatismyip.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              whatismyip.com
            </a>{' '}
            from that location.
          </p>

          <div className="space-y-3">
            {ips.map((ip, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    value={ip}
                    onChange={(e) => handleIpChange(index, e.target.value)}
                    placeholder="e.g., 172.249.105.229"
                    className={errors[index] ? 'border-red-500' : ''}
                  />
                  {errors[index] && (
                    <p className="mt-1 text-xs text-red-600">{errors[index]}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeIp(index)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {ips.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                No IP addresses configured. Add IPs to restrict POS access.
              </p>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addIpField}>
              <Plus className="mr-1 h-4 w-4" />
              Add IP Address
            </Button>
          </div>

          {/* Warning if enabled but no IPs */}
          {enabled && !hasValidIps && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Warning: No IPs configured</p>
                <p className="mt-1">
                  You must add at least one IP address before enabling restrictions, otherwise no one
                  can access the POS.
                </p>
              </div>
            </div>
          )}

          {/* Warning if current IP not in list */}
          {enabled && hasValidIps && currentIp && currentIp !== 'unknown' && !isCurrentIpAdded && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Your IP is not whitelisted</p>
                <p className="mt-1">
                  Your current IP ({currentIp}) is not in the whitelist. You may lose access to the
                  POS from this location if you save with restrictions enabled.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-400">
              {hasValidIps
                ? `${currentClean.length} IP${currentClean.length !== 1 ? 's' : ''} configured`
                : 'No IPs configured'}
            </p>
            <Button onClick={handleSave} disabled={saving || hasErrors}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
