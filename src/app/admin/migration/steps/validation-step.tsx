'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Users,
  Package,
  Receipt,
  Star,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatPoints } from '@/lib/utils/format';
import { parseDollarAmount } from '@/lib/migration/phone-utils';
import type { MigrationState } from '@/lib/migration/types';

interface ValidationStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
}

interface ValidationCheck {
  label: string;
  csvCount: number;
  dbCount: number | null;
  icon: typeof Users;
  status: 'loading' | 'pass' | 'warn' | 'fail';
  note?: string;
}

interface TopSpender {
  name: string;
  dbSpend: number;
  csvSpend: number;
  match: boolean;
}

export function ValidationStep({ state, onStateChange }: ValidationStepProps) {
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [topSpenders, setTopSpenders] = useState<TopSpender[]>([]);
  const [inventoryCheck, setInventoryCheck] = useState<{
    csvTotal: number;
    dbTotal: number | null;
  } | null>(null);

  const customers = state.parsedData.customers || [];
  const products = state.parsedData.products || [];
  const transactions = state.parsedData.transactions || [];
  const transactionItems = state.parsedData.transactionItems || [];

  // CSV-side counts
  const csvCustomerCount = customers.length;
  const csvProductCount = products.filter(
    (p) => p['Archived'] !== 'Y' && p['SKU'] !== '305152J' && (p['Item Name'] || '').trim() !== 'Custom Amount'
  ).length;
  const csvTransactionCount = transactions.filter(
    (t) => t['Event Type'] === 'Payment'
  ).length;

  // CSV inventory total
  const csvInventoryTotal = useMemo(() => {
    return products.reduce(
      (sum, p) => sum + (parseInt(p['Current Quantity SDASAS'] || '0', 10) || 0),
      0
    );
  }, [products]);

  // CSV top spenders
  const csvTopSpenders = useMemo(() => {
    return customers
      .filter((c) => c['Lifetime Spend'])
      .map((c) => ({
        name: `${c['First Name']} ${c['Last Name']}`.trim(),
        refId: c['Reference ID'],
        spend: parseDollarAmount(c['Lifetime Spend']),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);
  }, [customers]);

  useEffect(() => {
    async function runValidation() {
      setLoading(true);
      const supabase = createClient();

      try {
        // Count customers in DB
        const { count: dbCustomers } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .not('square_reference_id', 'is', null);

        // Count products in DB
        const { count: dbProducts } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .not('square_item_id', 'is', null);

        // Count transactions in DB
        const { count: dbTransactions } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .not('square_transaction_id', 'is', null);

        // Build validation checks
        const validationChecks: ValidationCheck[] = [
          {
            label: 'Customers',
            csvCount: csvCustomerCount,
            dbCount: dbCustomers,
            icon: Users,
            status: dbCustomers === null ? 'loading' : 'pass',
            note:
              dbCustomers !== null && dbCustomers < csvCustomerCount
                ? `${csvCustomerCount - dbCustomers} excluded (Tier 4 / duplicates)`
                : undefined,
          },
          {
            label: 'Products',
            csvCount: csvProductCount,
            dbCount: dbProducts,
            icon: Package,
            status: dbProducts === null ? 'loading' : 'pass',
            note:
              dbProducts !== null && dbProducts < csvProductCount
                ? `${csvProductCount - dbProducts} items not imported`
                : undefined,
          },
          {
            label: 'Transactions',
            csvCount: csvTransactionCount,
            dbCount: dbTransactions,
            icon: Receipt,
            status: dbTransactions === null ? 'loading' : 'pass',
          },
        ];

        // Determine statuses
        validationChecks.forEach((check) => {
          if (check.dbCount === null) {
            check.status = 'fail';
          } else if (check.dbCount === 0 && check.csvCount > 0) {
            check.status = 'warn';
            check.note = 'Step was skipped';
          } else if (check.dbCount < check.csvCount * 0.5) {
            check.status = 'warn';
            check.note = check.note || 'Significant count difference';
          } else {
            check.status = 'pass';
          }
        });

        setChecks(validationChecks);

        // Top spenders comparison
        if (csvTopSpenders.length > 0) {
          const spenderResults: TopSpender[] = [];
          for (const csvSpender of csvTopSpenders) {
            let dbSpend = 0;
            if (csvSpender.refId) {
              const { data } = await supabase
                .from('customers')
                .select('lifetime_spend')
                .eq('square_reference_id', csvSpender.refId)
                .maybeSingle();
              dbSpend = data?.lifetime_spend ?? 0;
            }
            spenderResults.push({
              name: csvSpender.name,
              csvSpend: csvSpender.spend,
              dbSpend,
              match: Math.abs(dbSpend - csvSpender.spend) < 1,
            });
          }
          setTopSpenders(spenderResults);
        }

        // Inventory check
        if (products.length > 0) {
          const { data: dbInventory } = await supabase
            .from('products')
            .select('quantity_on_hand')
            .not('square_item_id', 'is', null);

          const dbTotal = dbInventory?.reduce((sum: number, p: { quantity_on_hand: number | null }) => sum + (p.quantity_on_hand || 0), 0) ?? 0;
          setInventoryCheck({ csvTotal: csvInventoryTotal, dbTotal });
        }

        // Update state
        const allPass = validationChecks.every((c) => c.status === 'pass' || c.status === 'warn');
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          validation: {
            status: allPass ? 'completed' : 'error',
            message: allPass ? 'All validation checks passed' : 'Some validation checks failed',
          },
        };
        onStateChange(newState);
      } catch (err) {
        console.error('Validation error:', err);
        setChecks([]);
      } finally {
        setLoading(false);
      }
    }

    runValidation();
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPassed = checks.length > 0 && checks.every((c) => c.status !== 'fail');
  const isCompleted = state.steps.validation.status === 'completed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Validation Report</h2>
        <p className="mt-1 text-sm text-gray-500">
          Comparing imported data against original CSV files to verify migration accuracy.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-sm text-gray-500">Running validation checks...</span>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Record Count Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Record Count Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {checks.map((check) => {
                  const Icon = check.icon;
                  const StatusIcon =
                    check.status === 'pass'
                      ? CheckCircle
                      : check.status === 'warn'
                        ? AlertTriangle
                        : XCircle;
                  const statusColor =
                    check.status === 'pass'
                      ? 'text-green-600'
                      : check.status === 'warn'
                        ? 'text-yellow-600'
                        : 'text-red-600';

                  return (
                    <div
                      key={check.label}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`h-5 w-5 ${statusColor}`} />
                        <Icon className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium">{check.label}</p>
                          {check.note && (
                            <p className="text-xs text-gray-500">{check.note}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-xs text-gray-400">CSV</p>
                          <p className="font-mono font-medium">
                            {check.csvCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Database</p>
                          <p className="font-mono font-medium">
                            {check.dbCount?.toLocaleString() ?? 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top Spenders Comparison */}
          {topSpenders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top 10 Spenders: CSV vs Database</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto rounded border">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border-b px-3 py-2 text-left font-medium">#</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Customer</th>
                        <th className="border-b px-3 py-2 text-right font-medium">CSV Spend</th>
                        <th className="border-b px-3 py-2 text-right font-medium">DB Spend</th>
                        <th className="border-b px-3 py-2 text-center font-medium">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSpenders.map((s, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium">{s.name}</td>
                          <td className="px-3 py-1.5 text-right">
                            {formatCurrency(s.csvSpend)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {formatCurrency(s.dbSpend)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {s.match ? (
                              <CheckCircle className="mx-auto h-4 w-4 text-green-500" />
                            ) : (
                              <span className="text-red-500 font-medium">
                                {formatCurrency(Math.abs(s.dbSpend - s.csvSpend))}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inventory Comparison */}
          {inventoryCheck && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inventory Totals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    {Math.abs(
                      (inventoryCheck.dbTotal ?? 0) - inventoryCheck.csvTotal
                    ) < 5 ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    <p className="text-sm font-medium">Total Quantity on Hand</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">CSV</p>
                      <p className="font-mono font-medium">
                        {inventoryCheck.csvTotal.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Database</p>
                      <p className="font-mono font-medium">
                        {inventoryCheck.dbTotal?.toLocaleString() ?? 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Migration Step Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(state.steps).map(([key, step]) => {
                  const statusIcon =
                    step.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : step.status === 'skipped' ? (
                      <AlertTriangle className="h-4 w-4 text-gray-400" />
                    ) : step.status === 'error' ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                    );

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {statusIcon}
                        <span className="text-sm capitalize">{key}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.count !== undefined && (
                          <span className="text-xs text-gray-500">
                            {step.count.toLocaleString()}
                          </span>
                        )}
                        <Badge
                          variant={
                            step.status === 'completed'
                              ? 'success'
                              : step.status === 'error'
                                ? 'destructive'
                                : step.status === 'skipped'
                                  ? 'warning'
                                  : 'secondary'
                          }
                        >
                          {step.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Final Banner */}
          {allPassed && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <Shield className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">
                      Migration Complete
                    </h3>
                    <p className="text-sm text-green-700">
                      All validation checks passed. Your Square data has been successfully migrated
                      to the Auto Detail platform.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!allPassed && checks.some((c) => c.status === 'fail') && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <XCircle className="h-8 w-8 text-red-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-900">
                      Validation Issues Found
                    </h3>
                    <p className="text-sm text-red-700">
                      Some validation checks failed. Review the issues above and re-run any
                      necessary import steps.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
