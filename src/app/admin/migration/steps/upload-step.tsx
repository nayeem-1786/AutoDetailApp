'use client';

import { useCallback, useState } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, X } from 'lucide-react';
import type {
  MigrationState,
  CustomerImportRow,
  ProductImportRow,
  TransactionItemRow,
  TransactionRow,
} from '@/lib/migration/types';

interface UploadStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

type FileType = 'customers' | 'products' | 'transactionItems' | 'transactions';

interface ParsedFile {
  file: File;
  rowCount: number;
  headers: string[];
  preview: Record<string, string>[];
}

const FILE_CONFIGS: {
  key: FileType;
  label: string;
  description: string;
  required: boolean;
}[] = [
  {
    key: 'customers',
    label: 'Customer CSV',
    description: 'Square customer export (export-*.csv)',
    required: true,
  },
  {
    key: 'products',
    label: 'Product / Catalog CSV',
    description: 'Square catalog export (catalog-*.csv)',
    required: false,
  },
  {
    key: 'transactionItems',
    label: 'Transaction Items CSV',
    description: 'Square transaction items (items-*.csv)',
    required: false,
  },
  {
    key: 'transactions',
    label: 'Transactions CSV',
    description: 'Square transactions (transactions-*.csv)',
    required: false,
  },
];

export function UploadStep({ state, onStateChange, onContinue }: UploadStepProps) {
  const [parsedFiles, setParsedFiles] = useState<Partial<Record<FileType, ParsedFile>>>({});
  const [parsing, setParsing] = useState<FileType | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<FileType | null>(null);

  const handleFileSelect = useCallback(
    (fileType: FileType, file: File) => {
      setParsing(fileType);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as Record<string, string>[];
          const headers = results.meta.fields || [];

          setParsedFiles((prev) => ({
            ...prev,
            [fileType]: {
              file,
              rowCount: rows.length,
              headers,
              preview: rows.slice(0, 5),
            },
          }));

          // Store in migration state
          const newState = { ...state };
          newState.uploadedFiles = { ...state.uploadedFiles, [fileType]: file };

          // Type-safe assignment of parsed data
          if (fileType === 'customers') {
            newState.parsedData = {
              ...state.parsedData,
              customers: rows as unknown as CustomerImportRow[],
            };
          } else if (fileType === 'products') {
            newState.parsedData = {
              ...state.parsedData,
              products: rows as unknown as ProductImportRow[],
            };
          } else if (fileType === 'transactionItems') {
            newState.parsedData = {
              ...state.parsedData,
              transactionItems: rows as unknown as TransactionItemRow[],
            };
          } else if (fileType === 'transactions') {
            newState.parsedData = {
              ...state.parsedData,
              transactions: rows as unknown as TransactionRow[],
            };
          }

          onStateChange(newState);
          setParsing(null);
        },
        error: () => {
          setParsing(null);
        },
      });
    },
    [state, onStateChange]
  );

  const handleDrop = useCallback(
    (fileType: FileType) => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleFileSelect(fileType, file);
      }
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (fileType: FileType) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(fileType, file);
      }
    },
    [handleFileSelect]
  );

  const removeFile = useCallback(
    (fileType: FileType) => {
      setParsedFiles((prev) => {
        const next = { ...prev };
        delete next[fileType];
        return next;
      });

      const newState = { ...state };
      newState.uploadedFiles = { ...state.uploadedFiles };
      delete newState.uploadedFiles[fileType];
      newState.parsedData = { ...state.parsedData };
      delete newState.parsedData[fileType];
      onStateChange(newState);
    },
    [state, onStateChange]
  );

  const canContinue = !!parsedFiles.customers;

  const uploadedCount = Object.keys(parsedFiles).length;
  const totalCount = FILE_CONFIGS.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Upload Square CSV Files</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload your exported Square CSV files. Customer CSV is required, others are optional.
          </p>
        </div>
        <Badge variant={uploadedCount === totalCount ? 'success' : 'info'}>
          {uploadedCount}/{totalCount} files loaded
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FILE_CONFIGS.map((config) => {
          const parsed = parsedFiles[config.key];
          const isParsing = parsing === config.key;

          return (
            <Card key={config.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {config.label}
                    {config.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </CardTitle>
                  {parsed && (
                    <button
                      onClick={() => removeFile(config.key)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">{config.description}</p>
              </CardHeader>
              <CardContent>
                {parsed ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-green-900">
                          {parsed.file.name}
                        </p>
                        <p className="text-xs text-green-700">
                          {parsed.rowCount.toLocaleString()} rows, {parsed.headers.length} columns
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setExpandedPreview(
                          expandedPreview === config.key ? null : config.key
                        )
                      }
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      {expandedPreview === config.key ? 'Hide preview' : 'Show preview (first 5 rows)'}
                    </button>

                    {expandedPreview === config.key && (
                      <div className="max-h-48 overflow-auto rounded border">
                        <table className="min-w-full text-xs">
                          <thead className="sticky top-0 bg-gray-50">
                            <tr>
                              {parsed.headers.slice(0, 8).map((h) => (
                                <th
                                  key={h}
                                  className="whitespace-nowrap border-b px-2 py-1 text-left font-medium text-gray-600"
                                >
                                  {h}
                                </th>
                              ))}
                              {parsed.headers.length > 8 && (
                                <th className="border-b px-2 py-1 text-left font-medium text-gray-400">
                                  +{parsed.headers.length - 8} more
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {parsed.preview.map((row, i) => (
                              <tr key={i} className="border-b last:border-0">
                                {parsed.headers.slice(0, 8).map((h) => (
                                  <td
                                    key={h}
                                    className="max-w-[120px] truncate whitespace-nowrap px-2 py-1 text-gray-700"
                                  >
                                    {row[h] || '-'}
                                  </td>
                                ))}
                                {parsed.headers.length > 8 && (
                                  <td className="px-2 py-1 text-gray-400">...</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop(config.key)}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 transition-colors hover:border-gray-400 hover:bg-gray-100"
                  >
                    {isParsing ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                        <span className="text-sm text-gray-500">Parsing...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="mb-2 h-8 w-8 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">
                          Drop CSV here or click to browse
                        </span>
                        <span className="mt-1 text-xs text-gray-400">
                          .csv files only
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleInputChange(config.key)}
                    />
                  </label>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      {uploadedCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Ready to proceed with {uploadedCount} file{uploadedCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {parsedFiles.customers && `${parsedFiles.customers.rowCount.toLocaleString()} customers`}
                  {parsedFiles.products && `, ${parsedFiles.products.rowCount.toLocaleString()} products`}
                  {parsedFiles.transactionItems && `, ${parsedFiles.transactionItems.rowCount.toLocaleString()} transaction items`}
                  {parsedFiles.transactions && `, ${parsedFiles.transactions.rowCount.toLocaleString()} transactions`}
                </p>
              </div>
              <Button onClick={onContinue} disabled={!canContinue}>
                Continue to Customer Import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!canContinue && uploadedCount === 0 && (
        <p className="text-center text-sm text-gray-400">
          Upload at least the Customer CSV to continue.
        </p>
      )}
    </div>
  );
}
