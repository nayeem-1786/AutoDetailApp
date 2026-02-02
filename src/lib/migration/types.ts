// Migration types for Square Data Import

export type MigrationStep =
  | 'upload'
  | 'customers'
  | 'products'
  | 'employees'
  | 'vehicles'
  | 'transactions'
  | 'loyalty'
  | 'validation';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'error' | 'skipped';

export const MIGRATION_STEPS: { key: MigrationStep; label: string; number: number }[] = [
  { key: 'upload', label: 'Upload CSVs', number: 1 },
  { key: 'customers', label: 'Customer Import', number: 2 },
  { key: 'products', label: 'Product Import', number: 3 },
  { key: 'employees', label: 'Employee Setup', number: 4 },
  { key: 'vehicles', label: 'Vehicle Inference', number: 5 },
  { key: 'transactions', label: 'Transaction Import', number: 6 },
  { key: 'loyalty', label: 'Loyalty Calculation', number: 7 },
  { key: 'validation', label: 'Validation Report', number: 8 },
];

export interface StepState {
  status: StepStatus;
  message?: string;
  count?: number;
  errors?: string[];
}

export interface MigrationState {
  currentStep: MigrationStep;
  steps: Record<MigrationStep, StepState>;
  uploadedFiles: {
    customers?: File;
    products?: File;
    transactionItems?: File;
    transactions?: File;
  };
  parsedData: {
    customers?: CustomerImportRow[];
    products?: ProductImportRow[];
    transactionItems?: TransactionItemRow[];
    transactions?: TransactionRow[];
  };
}

export function createInitialState(): MigrationState {
  return {
    currentStep: 'upload',
    steps: {
      upload: { status: 'pending' },
      customers: { status: 'pending' },
      products: { status: 'pending' },
      employees: { status: 'pending' },
      vehicles: { status: 'pending' },
      transactions: { status: 'pending' },
      loyalty: { status: 'pending' },
      validation: { status: 'pending' },
    },
    uploadedFiles: {},
    parsedData: {},
  };
}

// Square Customer Export CSV columns (exact header names from export)
export interface CustomerImportRow {
  'Reference ID': string;
  'First Name': string;
  'Last Name': string;
  'Email Address': string;
  'Phone Number': string;
  'Nickname': string;
  'Company Name': string;
  'Street Address 1': string;
  'Street Address 2': string;
  'City': string;
  'State': string;
  'Postal Code': string;
  'Birthday': string;
  'Memo': string;
  'Square Customer ID': string;
  'Creation Source': string;
  'First Visit': string;
  'Last Visit': string;
  'Transaction Count': string;
  'Lifetime Spend': string;
  'Email Subscription Status': string;
  'Instant Profile': string;
  'Blocked from online booking': string;
  [key: string]: string;
}

// Square Catalog Export CSV columns (exact header names from export)
export interface ProductImportRow {
  'Token': string;
  'Item Name': string;
  'Customer-facing Name': string;
  'Variation Name': string;
  'Unit and Precision': string;
  'SKU': string;
  'Description': string;
  'Categories': string;
  'Reporting Category': string;
  'SEO Title': string;
  'SEO Description': string;
  'Permalink': string;
  'GTIN': string;
  'Square Online Item Visibility': string;
  'Item Type': string;
  'Weight (lb)': string;
  'Price': string;
  'Online Sale Price': string;
  'Archived': string;
  'Sellable': string;
  'Stockable': string;
  'Default Unit Cost': string;
  'Default Vendor Name': string;
  'Default Vendor Code': string;
  'Current Quantity SDASAS': string;
  'New Quantity SDASAS': string;
  'Stock Alert Enabled SDASAS': string;
  'Stock Alert Count SDASAS': string;
  'Tax - Tax (10.25%)': string;
  [key: string]: string;
}

// Square Transaction Items CSV columns
export interface TransactionItemRow {
  'Date': string;
  'Time': string;
  'Time Zone': string;
  'Category': string;
  'Item': string;
  'Qty': string;
  'Price Point Name': string;
  'SKU': string;
  'Modifiers Applied': string;
  'Gross Sales': string;
  'Discounts': string;
  'Net Sales': string;
  'Tax': string;
  'Transaction ID': string;
  'Payment ID': string;
  'Device Name': string;
  'Notes': string;
  'Details': string;
  'Event Type': string;
  'Location': string;
  'Customer ID': string;
  'Customer Name': string;
  'Customer Reference ID': string;
  'Itemization Type': string;
  'Employee': string;
  'Channel': string;
  'Card Brand': string;
  'PAN Suffix': string;
  [key: string]: string;
}

// Square Transactions CSV columns
export interface TransactionRow {
  'Date': string;
  'Time': string;
  'Time Zone': string;
  'Gross Sales': string;
  'Discounts': string;
  'Service Charges': string;
  'Net Sales': string;
  'Gift Card Sales': string;
  'Tax': string;
  'Tip': string;
  'Partial Refunds': string;
  'Total Collected': string;
  'Source': string;
  'Card': string;
  'Cash': string;
  'Fees': string;
  'Net Total': string;
  'Transaction ID': string;
  'Payment ID': string;
  'Card Brand': string;
  'PAN Suffix': string;
  'Device Name': string;
  'Staff Name': string;
  'Staff ID': string;
  'Details': string;
  'Description': string;
  'Event Type': string;
  'Location': string;
  'Customer ID': string;
  'Customer Name': string;
  'Customer Reference ID': string;
  'Transaction Status': string;
  'Channel': string;
  [key: string]: string;
}

export type CustomerTier = 1 | 2 | 3 | 4;

export interface ClassifiedCustomer {
  row: CustomerImportRow;
  tier: CustomerTier;
  normalizedPhone: string | null;
  phoneValid: boolean;
  originalPhone: string;
  visits: number;
  spend: number;
}

export interface InferredVehicle {
  customerId: string;
  customerName: string;
  sizeClass: 'sedan' | 'truck_suv_2row' | 'suv_3row_van';
  sizeLabel: string;
  transactionCount: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}
