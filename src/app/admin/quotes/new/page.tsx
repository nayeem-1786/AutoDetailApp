'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Customer, Vehicle } from '@/lib/supabase/types';
import { formatCurrency, formatPhone } from '@/lib/utils/format';
import { TAX_RATE } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { VEHICLE_SIZE_LABELS, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_SIZE_CLASSES } from '@/lib/utils/constants';
import { Plus, Trash2, ArrowLeft, Save, Send, Car, Mail, MessageSquare, ShoppingBag, X, UserPlus } from 'lucide-react';
import { ServicePickerDialog } from '../_components/service-picker-dialog';

interface LineItem {
  key: string; // local key for React
  item_name: string;
  quantity: number;
  unit_price: number;
  service_id: string | null;
  product_id: string | null;
  tier_name: string | null;
  notes: string | null;
}

function generateKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function NewQuotePage() {
  const router = useRouter();
  const supabase = createClient();

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');

  // Services no longer needed — ServicePickerDialog fetches its own data

  // Line items
  const [items, setItems] = useState<LineItem[]>([
    { key: generateKey(), item_name: '', quantity: 1, unit_price: 0, service_id: null, product_id: null, tier_name: null, notes: null },
  ]);

  // Form fields — default Valid Until to 10 days from today
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');

  // Add vehicle dialog
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicle_type: 'standard',
    size_class: '',
    year: '',
    make: '',
    model: '',
    color: '',
  });
  const [addingVehicle, setAddingVehicle] = useState(false);

  // Submission state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Service picker dialog
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItemKey, setPickerItemKey] = useState<string | null>(null);

  // Send dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendMethod, setSendMethod] = useState<'email' | 'sms' | 'both'>('email');


  // Close customer dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Search customers
  const searchCustomers = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setCustomerResults([]);
        return;
      }
      setSearchingCustomers(true);
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(10);
      if (data) setCustomerResults(data);
      setSearchingCustomers(false);
    },
    [supabase]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (customerSearch && !selectedCustomer) {
        searchCustomers(customerSearch);
        setShowCustomerDropdown(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer, searchCustomers]);

  // Load vehicles when customer is selected
  useEffect(() => {
    if (!selectedCustomer) {
      setVehicles([]);
      setVehicleId('');
      return;
    }
    async function loadVehicles() {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('customer_id', selectedCustomer!.id)
        .order('created_at', { ascending: false });
      if (data) {
        setVehicles(data);
        if (data.length === 1) setVehicleId(data[0].id);
      }
    }
    loadVehicles();
  }, [selectedCustomer, supabase]);

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.first_name} ${customer.last_name}`);
    setShowCustomerDropdown(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.customer;
      return next;
    });
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setVehicles([]);
    setVehicleId('');
  }

  async function handleAddVehicle() {
    if (!selectedCustomer) return;
    if (!newVehicle.make && !newVehicle.model) return;

    setAddingVehicle(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .insert({
          customer_id: selectedCustomer.id,
          vehicle_type: newVehicle.vehicle_type || 'standard',
          size_class: newVehicle.size_class || null,
          year: newVehicle.year ? parseInt(newVehicle.year) : null,
          make: newVehicle.make || null,
          model: newVehicle.model || null,
          color: newVehicle.color || null,
        })
        .select('*')
        .single();

      if (error || !data) {
        alert('Failed to add vehicle');
        return;
      }

      setVehicles((prev) => [data, ...prev]);
      setVehicleId(data.id);
      setShowAddVehicle(false);
      setNewVehicle({ vehicle_type: 'standard', size_class: '', year: '', make: '', model: '', color: '' });
    } catch {
      alert('An error occurred while adding the vehicle');
    } finally {
      setAddingVehicle(false);
    }
  }

  // Line item handlers
  function addItem() {
    setItems((prev) => [
      { key: generateKey(), item_name: '', quantity: 1, unit_price: 0, service_id: null, product_id: null, tier_name: null, notes: null },
      ...prev,
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function updateItem(key: string, field: keyof LineItem, value: string | number | null) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        return { ...item, [field]: value };
      })
    );
  }

  // Get the selected vehicle's size class (if any)
  const selectedVehicleSizeClass = useMemo(() => {
    if (!vehicleId) return null;
    const v = vehicles.find((v) => v.id === vehicleId);
    return v?.size_class ?? null;
  }, [vehicleId, vehicles]);

  // Handle service picker selection
  function handlePickerSelect(selection: {
    service_id: string;
    item_name: string;
    unit_price: number;
    tier_name: string | null;
  }) {
    if (!pickerItemKey) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== pickerItemKey) return item;
        return {
          ...item,
          service_id: selection.service_id,
          product_id: null,
          item_name: selection.item_name,
          unit_price: selection.unit_price,
          tier_name: selection.tier_name,
        };
      })
    );
  }

  // Totals calculation
  const { subtotal, taxAmount, total } = useMemo(() => {
    const sub = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const taxable = items.reduce((sum, item) => {
      if (item.product_id) return sum + item.quantity * item.unit_price;
      return sum;
    }, 0);
    const tax = Math.round(taxable * TAX_RATE * 100) / 100;
    return {
      subtotal: Math.round(sub * 100) / 100,
      taxAmount: tax,
      total: Math.round((sub + tax) * 100) / 100,
    };
  }, [items]);

  // Validation
  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!selectedCustomer) newErrors.customer = 'Please select a customer';
    const validItems = items.filter((item) => item.item_name.trim());
    if (validItems.length === 0) newErrors.items = 'At least one item is required';
    items.forEach((item, i) => {
      if (!item.item_name.trim()) newErrors[`item_${i}_name`] = 'Item name is required';
      if (item.unit_price <= 0) newErrors[`item_${i}_price`] = 'Price must be greater than 0';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave(sendVia?: 'email' | 'sms' | 'both') {
    if (!validate()) return;
    setSaving(true);

    try {
      const payload = {
        customer_id: selectedCustomer!.id,
        vehicle_id: vehicleId || null,
        items: items
          .filter((item) => item.item_name.trim())
          .map((item) => ({
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            service_id: item.service_id || null,
            product_id: item.product_id || null,
            tier_name: item.tier_name || null,
            notes: item.notes || null,
          })),
        notes: notes || null,
        valid_until: validUntil || null,
      };

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create quote');
        setSaving(false);
        return;
      }

      const { quote } = await res.json();

      if (sendVia && quote.id) {
        const sendRes = await fetch(`/api/quotes/${quote.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: sendVia }),
        });
        if (sendRes.ok) {
          const sendData = await sendRes.json();
          if (sendData.link) {
            await navigator.clipboard.writeText(sendData.link).catch(() => {});
          }
          const sentChannels = (sendData.sent_via || []).join(' & ');
          const errMsgs = (sendData.errors || []).join('\n');
          let msg = sentChannels ? `Estimate saved and sent via ${sentChannels}!` : 'Estimate saved and marked as sent.';
          if (errMsgs) msg += `\n\nWarnings:\n${errMsgs}`;
          alert(msg);
        }
      }

      setShowSendDialog(false);
      router.push('/admin/quotes');
    } catch {
      alert('An error occurred while saving the quote');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Quote"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Quotes
          </Button>
        }
      />

      {/* Customer Picker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assigned Customer</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/admin/customers/new', '_blank')}
            >
              <UserPlus className="h-4 w-4" />
              New Customer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div ref={customerDropdownRef} className="relative">
            <FormField label="Search Customer" required error={errors.customer}>
              <Input
                placeholder="Type customer name or phone..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (selectedCustomer) clearCustomer();
                }}
                onFocus={() => {
                  if (customerResults.length > 0 && !selectedCustomer) {
                    setShowCustomerDropdown(true);
                  }
                }}
              />
            </FormField>

            {showCustomerDropdown && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                {searchingCustomers ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                ) : customerResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">No customers found</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto py-1">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => selectCustomer(c)}
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {c.first_name} {c.last_name}
                          </div>
                          {c.phone && (
                            <div className="text-xs text-gray-500">{formatPhone(c.phone)}</div>
                          )}
                        </div>
                        {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </p>
                {selectedCustomer.phone && (
                  <p className="text-xs text-gray-500">{formatPhone(selectedCustomer.phone)}</p>
                )}
                {selectedCustomer.email && (
                  <p className="text-xs text-gray-500">{selectedCustomer.email}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={clearCustomer}>
                Change
              </Button>
            </div>
          )}

          {/* Vehicle Picker */}
          {selectedCustomer && (
            <FormField label="Vehicle">
              <div className="flex items-center gap-2">
                <Select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Select a vehicle...</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.year, v.make, v.model, v.color].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddVehicle(true)}
                >
                  <Car className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </FormField>
          )}
        </CardContent>
      </Card>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vehicle Type">
              <Select
                value={newVehicle.vehicle_type}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, vehicle_type: e.target.value, size_class: '' }))}
              >
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </FormField>
            {(VEHICLE_TYPE_SIZE_CLASSES[newVehicle.vehicle_type] ?? []).length > 0 && (
              <FormField label="Size Class">
                <Select
                  value={newVehicle.size_class}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, size_class: e.target.value }))}
                >
                  <option value="">Select size...</option>
                  {(VEHICLE_TYPE_SIZE_CLASSES[newVehicle.vehicle_type] ?? []).map((sc) => (
                    <option key={sc} value={sc}>{VEHICLE_SIZE_LABELS[sc] ?? sc}</option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Year">
              <Input
                type="number"
                placeholder="2024"
                value={newVehicle.year}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, year: e.target.value }))}
              />
            </FormField>
            <FormField label="Color">
              <Input
                placeholder="e.g., Black"
                value={newVehicle.color}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, color: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Make" required>
              <Input
                placeholder="e.g., Toyota"
                value={newVehicle.make}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, make: e.target.value }))}
              />
            </FormField>
            <FormField label="Model" required>
              <Input
                placeholder="e.g., Camry"
                value={newVehicle.model}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, model: e.target.value }))}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddVehicle(false)} disabled={addingVehicle}>
            Cancel
          </Button>
          <Button
            onClick={handleAddVehicle}
            disabled={addingVehicle || (!newVehicle.make && !newVehicle.model)}
          >
            {addingVehicle ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
            Add Vehicle
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Services */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Services</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </div>
          {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={item.key} className="rounded-md border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">Item {index + 1}</span>
                {items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(item.key)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="flex items-start gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-[22px] shrink-0"
                      onClick={() => {
                        setPickerItemKey(item.key);
                        setPickerOpen(true);
                      }}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Browse Services
                    </Button>
                    <FormField
                      label="Item Name"
                      required
                      error={errors[`item_${index}_name`]}
                      className="flex-1"
                    >
                      <div className="relative">
                        <Input
                          value={item.item_name}
                          onChange={(e) => updateItem(item.key, 'item_name', e.target.value)}
                          placeholder="Custom item or browse services..."
                          readOnly={!!item.service_id}
                          className={item.service_id ? 'pr-8' : ''}
                        />
                        {item.service_id && (
                          <button
                            type="button"
                            onClick={() => {
                              updateItem(item.key, 'service_id', null);
                              updateItem(item.key, 'item_name', '');
                              updateItem(item.key, 'unit_price', 0);
                              updateItem(item.key, 'tier_name', null);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            title="Clear service"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {item.tier_name && (
                        <p className="mt-0.5 text-xs text-gray-500">{item.tier_name}</p>
                      )}
                    </FormField>
                  </div>
                </div>

                <FormField label="Qty" className="lg:col-span-1">
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, 'quantity', parseInt(e.target.value) || 1)}
                  />
                </FormField>

                <FormField label="Unit Price" error={errors[`item_${index}_price`]} className="lg:col-span-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(item.key, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  />
                </FormField>

                <FormField label="Total" className="lg:col-span-1">
                  <div className="flex h-9 items-center text-sm font-medium text-gray-900">
                    {formatCurrency(item.quantity * item.unit_price)}
                  </div>
                </FormField>
              </div>

              <div className="mt-3">
                <FormField label="Notes">
                  <Input
                    value={item.notes || ''}
                    onChange={(e) => updateItem(item.key, 'notes', e.target.value || null)}
                    placeholder="Optional notes for this item..."
                  />
                </FormField>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Totals & Notes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Valid Until">
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes or special instructions..."
                rows={4}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Tax (10.25%)</span>
                <span className="font-medium text-gray-900">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
        <Button variant="outline" onClick={() => router.push('/admin/quotes')} disabled={saving}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => handleSave()} disabled={saving}>
          {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
          Save as Draft
        </Button>
        <Button onClick={() => setShowSendDialog(true)} disabled={saving}>
          <Send className="h-4 w-4" />
          Save & Send
        </Button>
      </div>

      {/* Service Picker Dialog */}
      <ServicePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        vehicleSizeClass={selectedVehicleSizeClass}
      />

      {/* Send Estimate Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogHeader>
          <DialogTitle>Send Estimate</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <p className="text-sm text-gray-600">
            How would you like to send this estimate to{' '}
            <span className="font-medium">{selectedCustomer?.first_name} {selectedCustomer?.last_name}</span>?
          </p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="email"
                checked={sendMethod === 'email'}
                onChange={() => setSendMethod('email')}
              />
              <Mail className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-gray-500">
                  {selectedCustomer?.email || 'No email on file'}
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="sms"
                checked={sendMethod === 'sms'}
                onChange={() => setSendMethod('sms')}
              />
              <MessageSquare className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">SMS (with PDF)</div>
                <div className="text-xs text-gray-500">
                  {selectedCustomer?.phone || 'No phone on file'}
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="both"
                checked={sendMethod === 'both'}
                onChange={() => setSendMethod('both')}
              />
              <Send className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">Both Email & SMS</div>
                <div className="text-xs text-gray-500">Send via all available channels</div>
              </div>
            </label>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => handleSave(sendMethod)} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
            Save & Send
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
