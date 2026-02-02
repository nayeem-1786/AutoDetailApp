'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Users, AlertTriangle, Phone, Mail, Ban } from 'lucide-react';
import {
  normalizePhoneForImport,
  classifyCustomerTier,
  parseDollarAmount,
} from '@/lib/migration/phone-utils';
import type { MigrationState, ClassifiedCustomer, CustomerTier } from '@/lib/migration/types';

interface CustomerStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

const TIER_CONFIG: Record<CustomerTier, { label: string; description: string; variant: 'success' | 'info' | 'warning' | 'destructive'; icon: typeof Users }> = {
  1: { label: 'Tier 1', description: 'Active with phone', variant: 'success', icon: Phone },
  2: { label: 'Tier 2', description: 'Prospect with phone', variant: 'info', icon: Phone },
  3: { label: 'Tier 3', description: 'Email only', variant: 'warning', icon: Mail },
  4: { label: 'Tier 4', description: 'No contact (excluded)', variant: 'destructive', icon: Ban },
};

export function CustomerStep({ state, onStateChange, onContinue }: CustomerStepProps) {
  const [importing, setImporting] = useState(false);
  const [includeTier3, setIncludeTier3] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewTier, setViewTier] = useState<CustomerTier | 'duplicates' | null>(null);

  const customers = state.parsedData.customers || [];

  // Classify all customers
  const classified = useMemo<ClassifiedCustomer[]>(() => {
    return customers.map((row) => {
      const phoneResult = normalizePhoneForImport(row['Phone Number'] || '');
      const email = (row['Email Address'] || '').trim();
      const visits = parseInt(row['Transaction Count'] || '0', 10) || 0;
      const spend = parseDollarAmount(row['Lifetime Spend'] || '0');

      const tier = classifyCustomerTier({
        phone: phoneResult.valid ? phoneResult.normalized : null,
        email: email || null,
        visits,
      });

      return {
        row,
        tier,
        normalizedPhone: phoneResult.normalized,
        phoneValid: phoneResult.valid,
        originalPhone: phoneResult.original,
        visits,
        spend,
      };
    });
  }, [customers]);

  // Group by tier
  const tierCounts = useMemo(() => {
    const counts: Record<CustomerTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    classified.forEach((c) => counts[c.tier]++);
    return counts;
  }, [classified]);

  // Find duplicate phones
  const duplicates = useMemo(() => {
    const phoneMap = new Map<string, ClassifiedCustomer[]>();
    classified.forEach((c) => {
      if (c.normalizedPhone) {
        const existing = phoneMap.get(c.normalizedPhone) || [];
        existing.push(c);
        phoneMap.set(c.normalizedPhone, existing);
      }
    });
    return Array.from(phoneMap.entries())
      .filter(([, custs]) => custs.length > 1)
      .map(([phone, custs]) => ({ phone, customers: custs }));
  }, [classified]);

  // Invalid phones (had phone number but couldn't normalize)
  const invalidPhones = useMemo(() => {
    return classified.filter(
      (c) => c.originalPhone && c.originalPhone.trim() !== '' && !c.phoneValid
    );
  }, [classified]);

  // Company names to tag
  const withCompany = useMemo(() => {
    return classified.filter(
      (c) => c.row['Company Name'] && c.row['Company Name'].trim() !== ''
    );
  }, [classified]);

  const importableCount =
    tierCounts[1] + tierCounts[2] + (includeTier3 ? tierCounts[3] : 0) - duplicates.length;

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);

    try {
      // Filter customers to import
      const toImport = classified.filter((c) => {
        if (c.tier === 4) return false;
        if (c.tier === 3 && !includeTier3) return false;
        return true;
      });

      // Deduplicate by phone - keep the one with more visits
      const phoneDedup = new Map<string, ClassifiedCustomer>();
      const emailOnly: ClassifiedCustomer[] = [];

      toImport.forEach((c) => {
        if (c.normalizedPhone) {
          const existing = phoneDedup.get(c.normalizedPhone);
          if (!existing || c.visits > existing.visits) {
            phoneDedup.set(c.normalizedPhone, c);
          }
        } else {
          emailOnly.push(c);
        }
      });

      const deduped = [...phoneDedup.values(), ...emailOnly];

      // Batch import in chunks
      const BATCH_SIZE = 100;
      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE);
        const payload = batch.map((c) => {
          const tags: string[] = [`tier-${c.tier}`, 'source:square-import'];
          if (c.row['Company Name']?.trim()) {
            tags.push(`company:${c.row['Company Name'].trim()}`);
          }

          return {
            square_reference_id: c.row['Reference ID'] || null,
            square_customer_id: c.row['Square Customer ID'] || null,
            first_name: c.row['First Name']?.trim() || '',
            last_name: c.row['Last Name']?.trim() || '',
            phone: c.normalizedPhone,
            email: c.row['Email Address']?.trim() || null,
            birthday: c.row['Birthday']?.trim() || null,
            address_line_1: c.row['Street Address 1']?.trim() || null,
            address_line_2: c.row['Street Address 2']?.trim() || null,
            city: c.row['City']?.trim() || null,
            state: c.row['State']?.trim() || null,
            zip: c.row['Postal Code']?.trim() || null,
            notes: c.row['Memo']?.trim() || null,
            tags,
            sms_consent: false,
            email_consent: false,
            visit_count: c.visits,
            lifetime_spend: c.spend,
            first_visit_date: c.row['First Visit']?.trim() || null,
            last_visit_date: c.row['Last Visit']?.trim() || null,
          };
        });

        const res = await fetch('/api/migration/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers: payload }),
        });

        const result = await res.json();
        if (result.error) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.error}`);
        } else {
          imported += result.imported || batch.length;
        }

        setProgress(Math.round(((i + batch.length) / deduped.length) * 100));
      }

      // Update state
      const newState = { ...state };
      newState.steps = {
        ...state.steps,
        customers: {
          status: errors.length > 0 ? 'error' : 'completed',
          count: imported,
          errors: errors.length > 0 ? errors : undefined,
          message: `Imported ${imported} customers`,
        },
      };
      onStateChange(newState);

      if (errors.length > 0) {
        toast.error(`Import completed with ${errors.length} errors`);
      } else {
        toast.success(`Successfully imported ${imported} customers`);
      }
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const isCompleted = state.steps.customers.status === 'completed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Customer Import</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review and import {customers.length.toLocaleString()} customers from Square export.
          Customers are classified by tier based on phone and visit data.
        </p>
      </div>

      {/* Tier Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        {([1, 2, 3, 4] as CustomerTier[]).map((tier) => {
          const config = TIER_CONFIG[tier];
          const Icon = config.icon;
          return (
            <Card
              key={tier}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                viewTier === tier ? 'ring-2 ring-gray-900' : ''
              }`}
              onClick={() => setViewTier(viewTier === tier ? null : tier)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                  <span className="text-2xl font-bold">{tierCounts[tier].toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{config.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tier detail tables */}
      {viewTier !== null && viewTier !== 'duplicates' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {TIER_CONFIG[viewTier].label} Customers ({tierCounts[viewTier]})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-medium">Name</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Phone</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Email</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Visits</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Spend</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Company</th>
                  </tr>
                </thead>
                <tbody>
                  {classified
                    .filter((c) => c.tier === viewTier)
                    .slice(0, 100)
                    .map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5">
                          {c.row['First Name']} {c.row['Last Name']}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          {c.phoneValid ? (
                            <span className="text-green-700">{c.normalizedPhone}</span>
                          ) : c.originalPhone ? (
                            <span className="text-red-600">{c.originalPhone}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="max-w-[150px] truncate px-3 py-1.5">
                          {c.row['Email Address'] || '-'}
                        </td>
                        <td className="px-3 py-1.5 text-right">{c.visits}</td>
                        <td className="px-3 py-1.5 text-right">
                          {c.spend > 0 ? `$${c.spend.toFixed(2)}` : '-'}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-1.5">
                          {c.row['Company Name'] || '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {classified.filter((c) => c.tier === viewTier).length > 100 && (
                <p className="p-2 text-center text-xs text-gray-400">
                  Showing first 100 of {tierCounts[viewTier]} records
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicate Phones */}
      {duplicates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <CardTitle className="text-sm">
                Duplicate Phone Numbers ({duplicates.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-gray-500">
              These phone numbers appear on multiple customer records. The record with the most
              visits will be kept during import.
            </p>
            <div className="max-h-48 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-medium">Phone</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Matching Records</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Will Keep</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.slice(0, 50).map((dup, i) => {
                    const best = dup.customers.reduce((a, b) =>
                      a.visits >= b.visits ? a : b
                    );
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                          {dup.phone}
                        </td>
                        <td className="px-3 py-1.5">
                          {dup.customers
                            .map(
                              (c) =>
                                `${c.row['First Name']} ${c.row['Last Name']} (${c.visits} visits)`
                            )
                            .join(', ')}
                        </td>
                        <td className="px-3 py-1.5 font-medium text-green-700">
                          {best.row['First Name']} {best.row['Last Name']}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invalid Phones */}
      {invalidPhones.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm">
                Invalid Phone Numbers ({invalidPhones.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-gray-500">
              These records had phone numbers that could not be normalized to E.164 format.
              They will be classified as email-only (Tier 3) or excluded (Tier 4).
            </p>
            <div className="max-h-36 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-medium">Name</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Original Phone</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidPhones.slice(0, 30).map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        {c.row['First Name']} {c.row['Last Name']}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-red-600">{c.originalPhone}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant={TIER_CONFIG[c.tier].variant}>
                          {TIER_CONFIG[c.tier].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notable: Companies */}
      {withCompany.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">{withCompany.length}</span> customers have company
              names that will be added as tags (e.g.,{' '}
              <span className="font-mono text-xs">
                company:{withCompany[0]?.row['Company Name']}
              </span>
              ).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Import Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">
                Ready to import{' '}
                <span className="text-lg font-bold">{importableCount.toLocaleString()}</span>{' '}
                customers
              </p>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeTier3}
                  onChange={(e) =>
                    setIncludeTier3((e.target as HTMLInputElement).checked)
                  }
                />
                <span className="text-sm text-gray-600">
                  Include Tier 3 (email-only) customers ({tierCounts[3]})
                </span>
              </label>
              <p className="text-xs text-gray-400">
                Tier 1 ({tierCounts[1]}) + Tier 2 ({tierCounts[2]})
                {includeTier3 ? ` + Tier 3 (${tierCounts[3]})` : ''} - duplicates (
                {duplicates.length})
              </p>
            </div>

            <div className="flex items-center gap-3">
              {importing && <Spinner size="sm" />}
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {state.steps.customers.count?.toLocaleString()} imported
                  </Badge>
                  <Button onClick={onContinue}>Continue to Products</Button>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing || importableCount === 0}>
                  {importing ? `Importing... ${progress}%` : 'Import Customers'}
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Errors */}
          {state.steps.customers.errors && state.steps.customers.errors.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">Import Errors:</p>
              {state.steps.customers.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">
                  {err}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
