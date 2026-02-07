'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { CONSENT_ACTION_LABELS } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import type { ColumnDef } from '@tanstack/react-table';

interface ConsentEntry {
  id: string;
  customer_id: string;
  channel: string;
  action: string;
  source: string;
  created_at: string;
  customers: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
}

interface CustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  sms_consent: boolean;
  email_consent: boolean;
}

export default function CompliancePage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<ConsentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Summary stats
  const [smsOptedIn, setSmsOptedIn] = useState(0);
  const [emailOptedIn, setEmailOptedIn] = useState(0);

  // Manual opt-out
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [optOutProcessing, setOptOutProcessing] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [optOutChannel, setOptOutChannel] = useState<'sms' | 'email'>('sms');

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);

    const [logRes, smsRes, emailRes] = await Promise.all([
      supabase
        .from('marketing_consent_log')
        .select('*, customers:customer_id(first_name, last_name, phone, email)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('sms_consent', true),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('email_consent', true),
    ]);

    if (logRes.data) setEntries(logRes.data as ConsentEntry[]);
    setSmsOptedIn(smsRes.count ?? 0);
    setEmailOptedIn(emailRes.count ?? 0);
    setLoading(false);
  }

  async function searchCustomers(query: string) {
    setCustomerSearch(query);
    if (query.trim().length < 2) {
      setCustomerResults([]);
      return;
    }

    const term = query.trim();
    const digits = term.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

    let dbQuery = supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, sms_consent, email_consent')
      .order('last_name')
      .limit(10);

    if (isPhoneSearch) {
      dbQuery = dbQuery.like('phone', `%${digits}%`);
    } else {
      dbQuery = dbQuery.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }

    const { data } = await dbQuery;
    setCustomerResults((data ?? []) as CustomerResult[]);
  }

  async function handleOptOut() {
    if (!selectedCustomer) return;

    setOptOutProcessing(true);
    try {
      const res = await fetch('/api/marketing/compliance/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          channel: optOutChannel,
        }),
      });

      if (res.ok) {
        toast.success(`${selectedCustomer.first_name} opted out of ${optOutChannel.toUpperCase()}`);
        setOptOutOpen(false);
        setSelectedCustomer(null);
        setCustomerSearch('');
        loadData();
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to process opt-out');
      }
    } catch {
      toast.error('Failed to process opt-out');
    } finally {
      setOptOutProcessing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (!e.customers) return false;
      const name = `${e.customers.first_name} ${e.customers.last_name}`.toLowerCase();
      return name.includes(q);
    });
  }, [entries, search]);

  const columns: ColumnDef<ConsentEntry, unknown>[] = [
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">
          {row.original.customers
            ? `${row.original.customers.first_name} ${row.original.customers.last_name}`
            : 'Unknown'}
        </span>
      ),
    },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => (
        <Badge variant="info">{row.original.channel.toUpperCase()}</Badge>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge variant={row.original.action === 'opt_in' ? 'success' : 'destructive'}>
          {CONSENT_ACTION_LABELS[row.original.action] || row.original.action}
        </Badge>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 capitalize">{row.original.source}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">{formatDateTime(row.original.created_at)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Marketing consent audit log"
        action={
          <Button onClick={() => setOptOutOpen(true)}>
            Manual Opt-Out
          </Button>
        }
      />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">SMS Opted In</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{smsOptedIn}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Email Opted In</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{emailOptedIn}</p>
          </CardContent>
        </Card>
      </div>

      {/* Consent log */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by customer name..."
          className="w-full sm:w-64"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No consent records"
        emptyDescription="Consent changes will appear here."
      />

      {/* Manual opt-out dialog */}
      {optOutOpen && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOptOutOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900">Manual Opt-Out</h3>
              <p className="mt-1 text-sm text-gray-500">
                Search for a customer and opt them out of a marketing channel.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Search Customer
                  </label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => searchCustomers(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  {customerResults.length > 0 && !selectedCustomer && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCustomer(c)}
                          className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span>{c.first_name} {c.last_name}</span>
                          <span className="text-xs text-gray-400">{c.phone || c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedCustomer && (
                  <>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm font-medium">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        SMS: {selectedCustomer.sms_consent ? 'Opted In' : 'Opted Out'} |
                        Email: {selectedCustomer.email_consent ? 'Opted In' : 'Opted Out'}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Channel</label>
                      <Select
                        value={optOutChannel}
                        onChange={(e) => setOptOutChannel(e.target.value as 'sms' | 'email')}
                      >
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setOptOutOpen(false); setSelectedCustomer(null); }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!selectedCustomer || optOutProcessing}
                  onClick={handleOptOut}
                >
                  {optOutProcessing ? 'Processing...' : 'Opt Out'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
