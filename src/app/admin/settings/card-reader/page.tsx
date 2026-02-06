'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

interface StripeLocation {
  id: string;
  display_name: string;
  address: {
    city?: string;
    state?: string;
  };
}

interface StripeReader {
  id: string;
  label: string;
  device_type: string;
  status: string;
  location?: string;
}

export default function CardReaderSettingsPage() {
  // Location state
  const [locations, setLocations] = useState<StripeLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [newLocationName, setNewLocationName] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Reader state
  const [registeredReaders, setRegisteredReaders] = useState<StripeReader[]>([]);
  const [registrationCode, setRegistrationCode] = useState('');
  const [readerLabel, setReaderLabel] = useState('');
  const [registeringReader, setRegisteringReader] = useState(false);
  const [loadingReaders, setLoadingReaders] = useState(false);

  // Load locations on mount
  useEffect(() => {
    loadLocations();
  }, []);

  // Load readers when location changes
  useEffect(() => {
    if (selectedLocation) {
      loadRegisteredReaders();
    }
  }, [selectedLocation]);

  async function loadLocations() {
    setLoadingLocations(true);
    try {
      const res = await fetch('/api/admin/stripe/locations');
      const data = await res.json();
      if (res.ok) {
        setLocations(data.locations || []);
        // Auto-select first location if exists
        if (data.locations?.length > 0 && !selectedLocation) {
          setSelectedLocation(data.locations[0].id);
        }
      } else {
        toast.error(data.error || 'Failed to load locations');
      }
    } catch {
      toast.error('Failed to load locations');
    } finally {
      setLoadingLocations(false);
    }
  }

  async function loadRegisteredReaders(allReaders = false) {
    setLoadingReaders(true);
    try {
      // Load all readers or just for selected location
      const url = allReaders || !selectedLocation
        ? '/api/admin/stripe/readers'
        : `/api/admin/stripe/readers?location=${selectedLocation}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setRegisteredReaders(data.readers || []);
      } else {
        toast.error(data.error || 'Failed to load readers');
      }
    } catch {
      toast.error('Failed to load readers');
    } finally {
      setLoadingReaders(false);
    }
  }

  async function handleDeleteReader(readerId: string, label: string) {
    if (!confirm(`Delete reader "${label}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/stripe/readers/${readerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Reader deleted');
        setRegisteredReaders((prev) => prev.filter((r) => r.id !== readerId));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete reader');
      }
    } catch {
      toast.error('Failed to delete reader');
    }
  }

  async function handleCreateLocation() {
    if (!newLocationName.trim()) {
      toast.error('Enter a location name');
      return;
    }

    setCreatingLocation(true);
    try {
      const res = await fetch('/api/admin/stripe/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: newLocationName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Location created');
        setNewLocationName('');
        setLocations((prev) => [...prev, data.location]);
        setSelectedLocation(data.location.id);
      } else {
        toast.error(data.error || 'Failed to create location');
      }
    } catch {
      toast.error('Failed to create location');
    } finally {
      setCreatingLocation(false);
    }
  }

  async function handleRegisterReader() {
    if (!registrationCode.trim()) {
      toast.error('Enter the registration code from the reader');
      return;
    }
    if (!selectedLocation) {
      toast.error('Select a location first');
      return;
    }

    setRegisteringReader(true);
    try {
      const res = await fetch('/api/admin/stripe/readers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_code: registrationCode.trim(),
          label: readerLabel.trim() || 'POS Reader',
          location: selectedLocation,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Reader registered successfully');
        setRegistrationCode('');
        setReaderLabel('');
        loadRegisteredReaders();
      } else {
        toast.error(data.error || 'Failed to register reader');
      }
    } catch {
      toast.error('Failed to register reader');
    } finally {
      setRegisteringReader(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Card Reader"
        description="Register and manage your Stripe Terminal card reader."
      />

      {/* Locations Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Locations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Create a location to organize your card readers. Each reader must be assigned to a location.
          </p>

          {loadingLocations ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading locations...
            </div>
          ) : locations.length > 0 ? (
            <div>
              <Label>Select Location</Label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.display_name}
                    {loc.address?.city ? ` (${loc.address.city}, ${loc.address.state})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
              <MapPin className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No locations yet. Create one to register readers.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Location name (e.g., Main Shop)"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateLocation()}
            />
            <Button
              onClick={handleCreateLocation}
              disabled={creatingLocation || !newLocationName.trim()}
            >
              {creatingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Register Reader Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Register Reader
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">
              How to get the pairing code from your WisePOS E:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-blue-700">
              <li>Power on your WisePOS E device</li>
              <li>Connect it to your WiFi network</li>
              <li>Go to <strong>Settings → Generate Pairing Code</strong></li>
              <li>Enter the code below (e.g., &quot;sepia-cerulean-aqua&quot;)</li>
            </ol>
          </div>

          <div>
            <Label>Registration Code</Label>
            <Input
              placeholder="e.g., sepia-cerulean-aqua"
              value={registrationCode}
              onChange={(e) => setRegistrationCode(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Reader Label (optional)</Label>
            <Input
              placeholder="e.g., Front Counter"
              value={readerLabel}
              onChange={(e) => setReaderLabel(e.target.value)}
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleRegisterReader}
            disabled={registeringReader || !registrationCode.trim() || !selectedLocation}
            className="w-full"
          >
            {registeringReader ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registering...
              </>
            ) : (
              'Register Reader'
            )}
          </Button>

          {!selectedLocation && (
            <p className="text-center text-sm text-amber-600">
              Create a location above before registering a reader.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Registered Readers List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Registered Readers</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadRegisteredReaders()}
              disabled={loadingReaders || !selectedLocation}
            >
              {loadingReaders ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingReaders ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : registeredReaders.length > 0 ? (
            <div className="space-y-3">
              {registeredReaders.map((reader) => (
                <div
                  key={reader.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{reader.label}</p>
                      <p className="text-sm text-gray-500">{reader.device_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {reader.status === 'online' ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        <AlertCircle className="h-3 w-3" />
                        {reader.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-8">
              <CreditCard className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No readers registered yet</p>
              <p className="text-xs text-gray-400">
                Register a reader using the pairing code above
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-600">
            <strong>Note:</strong> Once registered, readers will automatically connect when the POS is opened.
            The reader status will appear in the POS header. Card payments will use the connected reader.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
