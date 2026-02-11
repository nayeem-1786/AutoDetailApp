// ============================================
// QuickBooks Online Integration Types
// ============================================

/** QBO sync status stored on our records (transactions, customers, etc.) */
export interface QboSyncStatus {
  qbo_id: string | null;
  qbo_sync_status: 'pending' | 'synced' | 'failed' | 'skipped' | null;
  qbo_sync_error: string | null;
  qbo_synced_at: string | null;
}

/** QBO OAuth tokens stored in business_settings */
export interface QboTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  token_expires_at: string;
}

/** QBO Settings from business_settings */
export interface QboSettings {
  qbo_enabled: boolean;
  qbo_environment: 'sandbox' | 'production';
  qbo_auto_sync_transactions: boolean;
  qbo_auto_sync_customers: boolean;
  qbo_auto_sync_catalog: boolean;
  qbo_income_account_id: string;
  qbo_default_payment_method_id: string;
  qbo_last_sync_at: string;
}

/** QBO Sync Log entry */
export interface QboSyncLogEntry {
  id: string;
  entity_type: 'customer' | 'service' | 'product' | 'transaction';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  qbo_id: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  created_at: string;
  duration_ms: number | null;
}

// ============================================
// QBO API entity shapes
// ============================================

/** QBO Customer entity */
export interface QboCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  GivenName?: string;
  FamilyName?: string;
}

/** QBO Item entity (services + products) */
export interface QboItem {
  Id: string;
  SyncToken: string;
  Name: string;
  Type: 'Service' | 'Inventory' | 'NonInventory';
  IncomeAccountRef: { value: string; name: string };
  UnitPrice?: number;
}

/** QBO Sales Receipt entity */
export interface QboSalesReceipt {
  Id: string;
  SyncToken: string;
  TotalAmt: number;
  TxnDate: string;
  CustomerRef: { value: string; name?: string };
  Line: QboSalesReceiptLine[];
  DepositToAccountRef?: { value: string };
  PrivateNote?: string;
}

/** QBO Sales Receipt line item */
export interface QboSalesReceiptLine {
  Amount: number;
  DetailType: 'SalesItemLineDetail' | 'DiscountLineDetail' | 'SubTotalLineDetail';
  SalesItemLineDetail?: {
    ItemRef: { value: string; name?: string };
    Qty: number;
    UnitPrice: number;
  };
  DiscountLineDetail?: {
    PercentBased: boolean;
    DiscountPercent?: number;
    DiscountAccountRef?: { value: string };
  };
}

/** QBO Account entity */
export interface QboAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType: string;
}

/** QBO Payment Method entity */
export interface QboPaymentMethod {
  Id: string;
  Name: string;
}
