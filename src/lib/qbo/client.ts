import { createAdminClient } from '@/lib/supabase/admin';
import type {
  QboTokens,
  QboCustomer,
  QboItem,
  QboSalesReceipt,
  QboAccount,
  QboPaymentMethod,
} from './types';

// ============================================
// Constants
// ============================================

const QBO_BASE_URL = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com/v3/company',
  production: 'https://quickbooks.api.intuit.com/v3/company',
} as const;

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR_VERSION = '73';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// Custom Error
// ============================================

export class QboApiError extends Error {
  code: string;
  detail: string;
  statusCode: number;

  constructor(message: string, code: string, detail: string, statusCode: number) {
    super(message);
    this.name = 'QboApiError';
    this.code = code;
    this.detail = detail;
    this.statusCode = statusCode;
  }
}

// ============================================
// QBO Client
// ============================================

export class QboClient {
  private supabase = createAdminClient();

  /** Read OAuth tokens from business_settings. Returns null if not connected. */
  async getTokens(): Promise<QboTokens | null> {
    const { data } = await this.supabase
      .from('business_settings')
      .select('key, value')
      .in('key', [
        'qbo_access_token',
        'qbo_refresh_token',
        'qbo_realm_id',
        'qbo_token_expires_at',
      ]);

    if (!data) return null;

    const settings: Record<string, string> = {};
    for (const row of data) {
      const val = row.value as string;
      // business_settings stores values as JSON strings (e.g. '"value"')
      settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    }

    const access_token = settings.qbo_access_token;
    const refresh_token = settings.qbo_refresh_token;
    const realm_id = settings.qbo_realm_id;
    const token_expires_at = settings.qbo_token_expires_at;

    if (!access_token || !refresh_token || !realm_id) return null;

    return { access_token, refresh_token, realm_id, token_expires_at };
  }

  /** Returns true if the token expires within 5 minutes. */
  isTokenExpired(expiresAt: string): boolean {
    if (!expiresAt) return true;
    const expiryTime = new Date(expiresAt).getTime();
    return Date.now() >= expiryTime - TOKEN_EXPIRY_BUFFER_MS;
  }

  /** Refresh the access token using the refresh token grant. */
  async refreshAccessToken(): Promise<string> {
    const tokens = await this.getTokens();
    if (!tokens) throw new QboApiError('Not connected to QBO', 'NOT_CONNECTED', '', 0);

    // Read client credentials from env vars
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new QboApiError(
        'QBO credentials not configured — add QBO_CLIENT_ID and QBO_CLIENT_SECRET to .env.local',
        'NO_CREDENTIALS',
        '',
        0
      );
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // If refresh token is invalid, clear all tokens
      if (body.error === 'invalid_grant') {
        await this.clearTokens();
        throw new QboApiError(
          'QBO refresh token expired. Please reconnect.',
          'INVALID_GRANT',
          body.error_description || '',
          res.status
        );
      }
      throw new QboApiError(
        `Token refresh failed: ${body.error || res.statusText}`,
        body.error || 'TOKEN_REFRESH_FAILED',
        body.error_description || '',
        res.status
      );
    }

    const tokenData = await res.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Update tokens in business_settings
    const updates = [
      { key: 'qbo_access_token', value: JSON.stringify(tokenData.access_token) },
      { key: 'qbo_token_expires_at', value: JSON.stringify(expiresAt) },
    ];

    // QBO may also return a new refresh token
    if (tokenData.refresh_token) {
      updates.push({ key: 'qbo_refresh_token', value: JSON.stringify(tokenData.refresh_token) });
    }

    for (const { key, value } of updates) {
      await this.supabase
        .from('business_settings')
        .update({ value })
        .eq('key', key);
    }

    return tokenData.access_token;
  }

  /** Get a valid access token, refreshing if needed. */
  async getValidToken(): Promise<string> {
    const tokens = await this.getTokens();
    if (!tokens) throw new QboApiError('Not connected to QBO', 'NOT_CONNECTED', '', 0);

    if (this.isTokenExpired(tokens.token_expires_at)) {
      return this.refreshAccessToken();
    }

    return tokens.access_token;
  }

  /** Get the current QBO environment (sandbox or production). */
  private async getEnvironment(): Promise<'sandbox' | 'production'> {
    const { data } = await this.supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'qbo_environment')
      .single();

    const val = (data?.value as string) || '';
    const env = val.replace(/^"|"$/g, '');
    return env === 'production' ? 'production' : 'sandbox';
  }

  /** Core HTTP request to QBO API with automatic token refresh on 401. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let accessToken = await this.getValidToken();
    const tokens = await this.getTokens();
    if (!tokens) throw new QboApiError('Not connected to QBO', 'NOT_CONNECTED', '', 0);

    const environment = await this.getEnvironment();
    const baseUrl = QBO_BASE_URL[environment];
    const separator = path.includes('?') ? '&' : '?';
    const url = `${baseUrl}/${tokens.realm_id}/${path}${separator}minorversion=${MINOR_VERSION}`;
    const doFetch = async (token: string) => {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };
      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }
      return fetch(url, options);
    };

    let res = await doFetch(accessToken);

    // On 401, try one token refresh and retry
    if (res.status === 401) {
      accessToken = await this.refreshAccessToken();
      res = await doFetch(accessToken);
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const fault = errorBody.Fault?.Error?.[0];
      throw new QboApiError(
        fault?.Message || `QBO API error: ${res.statusText}`,
        fault?.code || 'API_ERROR',
        fault?.Detail || '',
        res.status
      );
    }

    return res.json() as Promise<T>;
  }

  /** Execute a QBO query (SQL-like). */
  async query<T>(entityName: string, whereClause: string): Promise<T[]> {
    const queryStr = `SELECT * FROM ${entityName} WHERE ${whereClause}`;
    const encodedQuery = encodeURIComponent(queryStr);

    const res = await this.request<{ QueryResponse: Record<string, T[]> }>(
      'GET',
      `query?query=${encodedQuery}`
    );

    return res.QueryResponse[entityName] || [];
  }

  // ============================================
  // Customers
  // ============================================

  /** Create a customer in QBO. */
  async createCustomer(data: Partial<QboCustomer>): Promise<QboCustomer> {
    const res = await this.request<{ Customer: QboCustomer }>('POST', 'customer', data);
    return res.Customer;
  }

  /** Update a customer in QBO. Requires Id and SyncToken. */
  async updateCustomer(data: Partial<QboCustomer>): Promise<QboCustomer> {
    const res = await this.request<{ Customer: QboCustomer }>('POST', 'customer', data);
    return res.Customer;
  }

  /** Find a customer by display name. Returns null if not found. */
  async findCustomerByName(displayName: string): Promise<QboCustomer | null> {
    const escaped = displayName.replace(/'/g, "\\'");
    const results = await this.query<QboCustomer>('Customer', `DisplayName = '${escaped}'`);
    return results[0] || null;
  }

  /** Query customers with a custom WHERE clause. */
  async queryCustomers(where: string): Promise<QboCustomer[]> {
    return this.query<QboCustomer>('Customer', where);
  }

  // ============================================
  // Items (Services + Products)
  // ============================================

  /** Create an item (service or product) in QBO. */
  async createItem(data: Partial<QboItem>): Promise<QboItem> {
    const res = await this.request<{ Item: QboItem }>('POST', 'item', data);
    return res.Item;
  }

  /** Update an item in QBO. Requires Id and SyncToken. */
  async updateItem(data: Partial<QboItem>): Promise<QboItem> {
    const res = await this.request<{ Item: QboItem }>('POST', 'item', data);
    return res.Item;
  }

  /** Find an item by name. Returns null if not found. */
  async findItemByName(name: string): Promise<QboItem | null> {
    const escaped = name.replace(/'/g, "\\'");
    const results = await this.query<QboItem>('Item', `Name = '${escaped}'`);
    return results[0] || null;
  }

  /** Query items with a custom WHERE clause. */
  async queryItems(where: string): Promise<QboItem[]> {
    return this.query<QboItem>('Item', where);
  }

  // ============================================
  // Sales Receipts
  // ============================================

  /** Create a sales receipt in QBO. */
  async createSalesReceipt(data: Partial<QboSalesReceipt>): Promise<QboSalesReceipt> {
    const res = await this.request<{ SalesReceipt: QboSalesReceipt }>('POST', 'salesreceipt', data);
    return res.SalesReceipt;
  }

  // ============================================
  // Accounts
  // ============================================

  /** Get accounts, optionally filtered by AccountType. */
  async getAccounts(accountType?: string): Promise<QboAccount[]> {
    if (accountType) {
      return this.query<QboAccount>('Account', `AccountType = '${accountType}'`);
    }
    // Fetch all accounts - use a broad query QBO supports
    const queryStr = encodeURIComponent('SELECT * FROM Account MAXRESULTS 1000');
    const res = await this.request<{ QueryResponse: { Account?: QboAccount[] } }>(
      'GET',
      `query?query=${queryStr}`
    );
    return res.QueryResponse.Account || [];
  }

  // ============================================
  // Payment Methods
  // ============================================

  /** Get all payment methods. */
  async getPaymentMethods(): Promise<QboPaymentMethod[]> {
    return this.query<QboPaymentMethod>('PaymentMethod', 'Active = true');
  }

  // ============================================
  // Company Info
  // ============================================

  /** Get company info (connection test). */
  async getCompanyInfo(): Promise<{ CompanyName: string; Country: string }> {
    const tokens = await this.getTokens();
    if (!tokens) throw new QboApiError('Not connected to QBO', 'NOT_CONNECTED', '', 0);

    const res = await this.request<{
      CompanyInfo: { CompanyName: string; Country: string };
    }>('GET', `companyinfo/${tokens.realm_id}`);

    return res.CompanyInfo;
  }

  // ============================================
  // Internal helpers
  // ============================================

  /** Clear all QBO tokens (disconnect). */
  private async clearTokens(): Promise<void> {
    const keys = [
      'qbo_access_token',
      'qbo_refresh_token',
      'qbo_realm_id',
      'qbo_token_expires_at',
    ];

    for (const key of keys) {
      await this.supabase
        .from('business_settings')
        .update({ value: '""' })
        .eq('key', key);
    }
  }
}
