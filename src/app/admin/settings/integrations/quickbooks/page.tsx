'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plug,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface QboStatus {
  status: 'connected' | 'disconnected';
  company_name: string | null;
  realm_id: string | null;
  environment: string;
  enabled: boolean;
  credentials_configured: boolean;
  last_sync_at: string | null;
  auto_sync: {
    transactions: boolean;
    customers: boolean;
    catalog: boolean;
  };
}

interface SyncStats {
  synced: number;
  failed: number;
  pending: number;
}

interface SyncLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  qbo_id: string | null;
  status: string;
  error_message: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  created_at: string;
  duration_ms: number | null;
}

interface QboAccount {
  Id: string;
  Name: string;
  AccountType: string;
}

export default function QuickBooksSettingsPage() {
  const searchParams = useSearchParams();

  // State
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<QboStatus | null>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Sync settings
  const [autoSyncTransactions, setAutoSyncTransactions] = useState(true);
  const [autoSyncCustomers, setAutoSyncCustomers] = useState(true);
  const [autoSyncCatalog, setAutoSyncCatalog] = useState(true);

  // Account mapping
  const [incomeAccounts, setIncomeAccounts] = useState<QboAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<QboAccount[]>([]);
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [savingAccounts, setSavingAccounts] = useState(false);

  // Sync stats
  const [syncStats, setSyncStats] = useState<SyncStats>({ synced: 0, failed: 0, pending: 0 });

  // Sync log
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | 'customer' | 'service' | 'product' | 'transaction'>('all');
  const [logLoading, setLogLoading] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const [hasMoreLog, setHasMoreLog] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Sync actions
  const [syncing, setSyncing] = useState<string | null>(null);

  const isConnected = connectionStatus?.status === 'connected';
  const credentialsConfigured = connectionStatus?.credentials_configured ?? false;

  // ── Load connection status ──
  const loadStatus = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/status');
      if (res.ok) {
        const data: QboStatus = await res.json();
        setConnectionStatus(data);
        setAutoSyncTransactions(data.auto_sync.transactions);
        setAutoSyncCustomers(data.auto_sync.customers);
        setAutoSyncCatalog(data.auto_sync.catalog);
      }
    } catch {
      // Ignore errors — we'll show disconnected state
    }
  }, []);

  // ── Load settings (account IDs + environment) ──
  const loadSettings = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/settings');
      if (res.ok) {
        const data = await res.json();
        setEnvironment(data.qbo_environment === 'production' ? 'production' : 'sandbox');
        setIncomeAccountId(data.qbo_income_account_id || '');
        setDepositAccountId(data.qbo_default_payment_method_id || '');
      }
    } catch {
      // Ignore
    }
  }, []);

  // ── Load sync stats ──
  const loadSyncStats = useCallback(async () => {
    const supabase = createClient();

    const [syncedRes, failedRes, pendingRes] = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('qbo_sync_status', 'synced'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('qbo_sync_status', 'failed'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('qbo_sync_status', 'pending'),
    ]);

    setSyncStats({
      synced: syncedRes.count || 0,
      failed: failedRes.count || 0,
      pending: pendingRes.count || 0,
    });
  }, []);

  // ── Load sync log ──
  const loadSyncLog = useCallback(async (reset = false) => {
    setLogLoading(true);
    const supabase = createClient();
    const offset = reset ? 0 : logPage * 20;

    let query = supabase
      .from('qbo_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + 19);

    if (logFilter !== 'all') {
      query = query.eq('status', logFilter);
    }
    if (entityFilter !== 'all') {
      query = query.eq('entity_type', entityFilter);
    }

    const { data } = await query;
    const entries = (data || []) as SyncLogEntry[];

    if (reset) {
      setSyncLog(entries);
      setLogPage(1);
    } else {
      setSyncLog((prev) => [...prev, ...entries]);
      setLogPage((p) => p + 1);
    }

    setHasMoreLog(entries.length === 20);
    setLogLoading(false);
  }, [logFilter, entityFilter, logPage]);

  // ── Load QBO accounts ──
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsFailed(false);
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/accounts');
      if (res.ok) {
        const data = await res.json();
        setIncomeAccounts(data.income || []);
        setBankAccounts(data.bank || []);
      } else {
        setAccountsFailed(true);
      }
    } catch {
      setAccountsFailed(true);
    }
    setAccountsLoading(false);
  }, []);

  // ── Initial load ──
  useEffect(() => {
    async function init() {
      await Promise.all([loadStatus(), loadSettings()]);
      setLoading(false);
    }
    init();
  }, [loadStatus, loadSettings]);

  // Load connected-only data once status is known
  useEffect(() => {
    if (isConnected) {
      loadSyncStats();
      loadSyncLog(true);
      loadAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Auto-refresh sync log
  useEffect(() => {
    if (!isConnected || !autoRefresh) return;
    const interval = setInterval(() => {
      loadSyncStats();
      loadSyncLog(true);
    }, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, autoRefresh]);

  // Handle URL params (post-OAuth redirect)
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Connected to QuickBooks!');
      loadStatus();
    }
    if (searchParams.get('error') === 'invalid_state') {
      toast.error('Connection failed — please try again');
    }
    if (searchParams.get('error') === 'no_credentials') {
      toast.error('QBO credentials not configured — add QBO_CLIENT_ID and QBO_CLIENT_SECRET to .env.local');
    }
    if (searchParams.get('error') === 'token_exchange_failed') {
      toast.error('Failed to complete authorization');
    }
    if (searchParams.get('warning') === 'connection_test_failed') {
      toast.warning('Connected but verification failed — please test the connection');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reload log when filters change
  useEffect(() => {
    if (isConnected) {
      loadSyncLog(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logFilter, entityFilter]);

  // ── Handlers ──

  async function handleSaveEnvironment() {
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qbo_environment: environment }),
      });
      if (res.ok) {
        toast.success('Environment saved');
      } else {
        toast.error('Failed to save environment');
      }
    } catch {
      toast.error('Failed to save environment');
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/disconnect', {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Disconnected from QuickBooks');
        setConnectionStatus((prev) => prev ? { ...prev, status: 'disconnected', company_name: null, realm_id: null } : null);
      } else {
        toast.error('Failed to disconnect');
      }
    } catch {
      toast.error('Failed to disconnect');
    }
    setDisconnecting(false);
    setDisconnectOpen(false);
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/status');
      if (res.ok) {
        const data = await res.json();
        if (data.company_name) {
          toast.success(`Connected to ${data.company_name}`);
        } else if (data.status === 'connected') {
          toast.warning('Connected but could not verify company info');
        } else {
          toast.error('Not connected');
        }
        setConnectionStatus(data);
      } else {
        toast.error('Connection test failed');
      }
    } catch {
      toast.error('Connection test failed');
    }
    setTestingConnection(false);
  }

  async function handleToggleSync(key: string, value: boolean) {
    try {
      await adminFetch('/api/admin/integrations/qbo/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      toast.error('Failed to update setting');
    }
  }

  async function handleSaveAccountMapping() {
    setSavingAccounts(true);
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qbo_income_account_id: incomeAccountId,
          qbo_default_payment_method_id: depositAccountId,
        }),
      });
      if (res.ok) {
        toast.success('Account mapping saved');
      } else {
        toast.error('Failed to save account mapping');
      }
    } catch {
      toast.error('Failed to save account mapping');
    }
    setSavingAccounts(false);
  }

  async function handleSync(type: string) {
    setSyncing(type);
    try {
      const res = await adminFetch('/api/admin/integrations/qbo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.status === 404) {
        toast.info('Sync endpoint not available yet — will be enabled in the next update');
      } else if (res.ok) {
        const data = await res.json();
        toast.success(`Sync complete: ${JSON.stringify(data)}`);
        loadSyncStats();
        loadSyncLog(true);
      } else {
        toast.error('Sync failed');
      }
    } catch {
      toast.info('Sync endpoint not available yet — will be enabled in the next update');
    }
    setSyncing(null);
  }

  async function handleClearLog() {
    const supabase = createClient();
    await supabase.from('qbo_sync_log').delete().gte('created_at', '1970-01-01');
    toast.success('Sync log cleared');
    loadSyncLog(true);
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="QuickBooks Online"
          description="Connect to QuickBooks for accounting sync."
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
        title="QuickBooks Online"
        description="Connect to QuickBooks for accounting sync."
      />

      {/* Feature toggle note */}
      <p className="text-sm text-gray-500">
        Enable or disable this integration from{' '}
        <Link href="/admin/settings/feature-toggles" className="text-blue-600 hover:text-blue-800 hover:underline">
          Settings &rarr; Feature Toggles
        </Link>.
      </p>

      {/* ── Section 1: Connection Status ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Connection</CardTitle>
            {isConnected ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="default">Not Connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Credentials status */}
          <div className="text-sm">
            {credentialsConfigured ? (
              <p className="text-green-700">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                API Credentials: Configured
              </p>
            ) : (
              <p className="text-amber-700">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                API Credentials: Not configured — add <code className="rounded bg-gray-100 px-1 text-xs">QBO_CLIENT_ID</code> and{' '}
                <code className="rounded bg-gray-100 px-1 text-xs">QBO_CLIENT_SECRET</code> to .env.local
              </p>
            )}
          </div>

          {isConnected ? (
            <>
              {connectionStatus?.company_name && (
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {connectionStatus.company_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {connectionStatus.environment === 'production' ? 'Production' : 'Sandbox'} &middot; Realm ID: {connectionStatus.realm_id}
                  </p>
                  {connectionStatus.last_sync_at && (
                    <p className="mt-1 text-sm text-gray-500">
                      Last sync: {new Date(connectionStatus.last_sync_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => setDisconnectOpen(true)}
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <FormField label="Environment" htmlFor="qbo_environment">
                <Select
                  id="qbo_environment"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'production')}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </Select>
              </FormField>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleSaveEnvironment}
                >
                  Save Environment
                </Button>
                <Button
                  disabled={!credentialsConfigured}
                  onClick={() => {
                    window.location.href = '/api/admin/integrations/qbo/connect';
                  }}
                >
                  <Plug className="mr-2 h-4 w-4" />
                  Connect to QuickBooks
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Sync Settings ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-sync transactions</p>
                <p className="text-sm text-gray-500">
                  Automatically push completed POS transactions to QuickBooks as Sales Receipts
                </p>
              </div>
              <Switch
                checked={autoSyncTransactions}
                onCheckedChange={(checked) => {
                  setAutoSyncTransactions(checked);
                  handleToggleSync('qbo_auto_sync_transactions', checked);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-sync customers</p>
                <p className="text-sm text-gray-500">
                  Create QuickBooks customer records when new customers are created
                </p>
              </div>
              <Switch
                checked={autoSyncCustomers}
                onCheckedChange={(checked) => {
                  setAutoSyncCustomers(checked);
                  handleToggleSync('qbo_auto_sync_customers', checked);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-sync catalog</p>
                <p className="text-sm text-gray-500">
                  Keep services and products in sync with QuickBooks Items
                </p>
              </div>
              <Switch
                checked={autoSyncCatalog}
                onCheckedChange={(checked) => {
                  setAutoSyncCatalog(checked);
                  handleToggleSync('qbo_auto_sync_catalog', checked);
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section 3: Account Mapping ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Account Mapping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Map your QuickBooks accounts for proper categorization of POS revenue.
            </p>

            {accountsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Income Account" htmlFor="income_account">
                  {accountsFailed ? (
                    <Input
                      id="income_account"
                      value={incomeAccountId}
                      onChange={(e) => setIncomeAccountId(e.target.value)}
                      placeholder="QBO Account ID"
                    />
                  ) : (
                    <Select
                      id="income_account"
                      value={incomeAccountId}
                      onChange={(e) => setIncomeAccountId(e.target.value)}
                    >
                      <option value="">Select account...</option>
                      {incomeAccounts.map((a) => (
                        <option key={a.Id} value={a.Id}>
                          {a.Name}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>

                <FormField label="Deposit Account" htmlFor="deposit_account">
                  {accountsFailed ? (
                    <Input
                      id="deposit_account"
                      value={depositAccountId}
                      onChange={(e) => setDepositAccountId(e.target.value)}
                      placeholder="QBO Account ID"
                    />
                  ) : (
                    <Select
                      id="deposit_account"
                      value={depositAccountId}
                      onChange={(e) => setDepositAccountId(e.target.value)}
                    >
                      <option value="">Select account...</option>
                      {bankAccounts.map((a) => (
                        <option key={a.Id} value={a.Id}>
                          {a.Name}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSaveAccountMapping} disabled={savingAccounts}>
                {savingAccounts ? 'Saving...' : 'Save Mapping'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section 4: Sync Actions ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleSync('all')}
                disabled={!!syncing}
              >
                {syncing === 'all' ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  'Sync All'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync('transactions')}
                disabled={!!syncing}
              >
                {syncing === 'transactions' ? 'Syncing...' : 'Sync Transactions'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync('catalog')}
                disabled={!!syncing}
              >
                {syncing === 'catalog' ? 'Syncing...' : 'Sync Catalog'}
              </Button>
              {syncStats.failed > 0 && (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => handleSync('retry')}
                  disabled={!!syncing}
                >
                  {syncing === 'retry' ? 'Retrying...' : 'Retry Failed'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section 5: Sync Stats ── */}
      {isConnected && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{syncStats.synced}</p>
                  <p className="text-xs text-gray-500">Synced</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <XCircle className={`h-5 w-5 ${syncStats.failed > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-2xl font-bold ${syncStats.failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {syncStats.failed}
                  </p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{syncStats.pending}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {connectionStatus?.last_sync_at
                      ? new Date(connectionStatus.last_sync_at).toLocaleString()
                      : 'Never'}
                  </p>
                  <p className="text-xs text-gray-500">Last Sync</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Section 6: Sync Log ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sync Log</CardTitle>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded"
                  />
                  Auto-refresh
                </label>
                <Button variant="outline" size="sm" onClick={handleClearLog}>
                  Clear Log
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                {(['all', 'success', 'failed', 'pending'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setLogFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      logFilter === f
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(['all', 'customer', 'service', 'product', 'transaction'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setEntityFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      entityFilter === f
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? 'All Types' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                  </button>
                ))}
              </div>
            </div>

            {/* Log table */}
            {logLoading && syncLog.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : syncLog.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No sync log entries</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-4"></th>
                      <th className="pb-2 pr-4">Timestamp</th>
                      <th className="pb-2 pr-4">Entity</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">QBO ID</th>
                      <th className="pb-2 pr-4">Duration</th>
                      <th className="pb-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLog.map((entry) => (
                      <>
                        <tr
                          key={entry.id}
                          className="border-b cursor-pointer hover:bg-gray-50"
                          onClick={() =>
                            setExpandedLogId(expandedLogId === entry.id ? null : entry.id)
                          }
                        >
                          <td className="py-2 pr-2">
                            {expandedLogId === entry.id ? (
                              <ChevronDown className="h-3 w-3 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-gray-400" />
                            )}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-500">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="default">
                              {entry.entity_type}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 capitalize">{entry.action}</td>
                          <td className="py-2 pr-4">
                            <Badge
                              variant={
                                entry.status === 'success'
                                  ? 'success'
                                  : entry.status === 'failed'
                                  ? 'destructive'
                                  : 'warning'
                              }
                            >
                              {entry.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-xs font-mono text-gray-500">
                            {entry.qbo_id || '—'}
                          </td>
                          <td className="py-2 pr-4 text-xs text-gray-500">
                            {entry.duration_ms ? `${entry.duration_ms}ms` : '—'}
                          </td>
                          <td className="py-2 text-xs text-red-600 max-w-[200px] truncate">
                            {entry.error_message || '—'}
                          </td>
                        </tr>
                        {expandedLogId === entry.id && (
                          <tr key={`${entry.id}-detail`} className="border-b bg-gray-50">
                            <td colSpan={8} className="p-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-xs font-semibold text-gray-500">Request Payload</p>
                                  <pre className="max-h-48 overflow-auto rounded bg-white p-3 text-xs font-mono border">
                                    {entry.request_payload
                                      ? JSON.stringify(entry.request_payload, null, 2)
                                      : 'None'}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-semibold text-gray-500">Response Payload</p>
                                  <pre className="max-h-48 overflow-auto rounded bg-white p-3 text-xs font-mono border">
                                    {entry.response_payload
                                      ? JSON.stringify(entry.response_payload, null, 2)
                                      : 'None'}
                                  </pre>
                                </div>
                              </div>
                              {entry.error_message && (
                                <div className="mt-3">
                                  <p className="mb-1 text-xs font-semibold text-red-500">Error Details</p>
                                  <p className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                                    {entry.error_message}
                                  </p>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {hasMoreLog && syncLog.length > 0 && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSyncLog(false)}
                  disabled={logLoading}
                >
                  {logLoading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Disconnect Confirmation ── */}
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect QuickBooks"
        description="This will revoke access tokens and disconnect from QuickBooks Online. Your sync history and settings will be preserved. You can reconnect at any time."
        confirmLabel="Disconnect"
        variant="destructive"
        loading={disconnecting}
        onConfirm={handleDisconnect}
      />
    </div>
  );
}
