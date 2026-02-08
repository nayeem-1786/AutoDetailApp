'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table';
import { Pagination } from './pagination';
import { EmptyState } from './empty-state';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ArrowUpDown, Download } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface BulkAction<TData> {
  label: string;
  onClick: (selectedRows: TData[]) => void;
  variant?: 'default' | 'destructive';
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  exportFilename?: string;
  bulkActions?: BulkAction<TData>[];
}

function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  exportFilename,
  bulkActions,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Build columns with optional checkbox column prepended
  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!bulkActions || bulkActions.length === 0) return columns;

    const selectColumn: ColumnDef<TData, unknown> = {
      id: '_select',
      size: 32,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    };

    return [selectColumn, ...columns];
  }, [columns, bulkActions]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize } },
    enableRowSelection: !!bulkActions && bulkActions.length > 0,
  });

  const selectedRows = React.useMemo(() => {
    return table.getSelectedRowModel().rows.map((row) => row.original);
  }, [table, rowSelection]);

  const handleExportCsv = React.useCallback(() => {
    if (!exportFilename) return;

    // Use the original columns (not the select column) for export headers
    const exportHeaders: string[] = [];
    const exportAccessors: ((row: TData) => string)[] = [];

    for (const col of columns) {
      // Get header text
      const header = typeof col.header === 'string' ? col.header : (col.id ?? '');
      exportHeaders.push(header);

      // Build accessor
      if ('accessorKey' in col && col.accessorKey) {
        const key = col.accessorKey as string;
        exportAccessors.push((row) => {
          const val = (row as Record<string, unknown>)[key];
          return val == null ? '' : String(val);
        });
      } else if ('accessorFn' in col && col.accessorFn) {
        const fn = col.accessorFn;
        exportAccessors.push((row) => {
          const val = fn(row, 0);
          return val == null ? '' : String(val);
        });
      } else {
        exportAccessors.push(() => '');
      }
    }

    const escapeCsvField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const csvRows = [
      exportHeaders.map(escapeCsvField).join(','),
      ...data.map((row) =>
        exportAccessors.map((accessor) => escapeCsvField(accessor(row))).join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFilename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [columns, data, exportFilename]);

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {exportFilename && (
          <div className="flex justify-end border-b border-gray-200 px-4 py-3">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colSize = header.column.columnDef.size;
                  return (
                  <TableHead key={header.id} style={colSize ? { width: colSize } : undefined}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() && 'cursor-pointer select-none'
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    )}
                  </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const colSize = cell.column.columnDef.size;
                  return (
                  <TableCell key={cell.id} style={colSize ? { width: colSize } : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {table.getPageCount() > 1 && (
          <div className="border-t border-gray-200 px-4 py-3">
            <Pagination
              currentPage={table.getState().pagination.pageIndex + 1}
              totalPages={table.getPageCount()}
              onPageChange={(page) => table.setPageIndex(page - 1)}
            />
          </div>
        )}
      </div>
      {bulkActions && bulkActions.length > 0 && selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-white shadow-lg">
            <span className="text-sm font-medium">
              {selectedRows.length} selected
            </span>
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                size="sm"
                onClick={() => action.onClick(selectedRows)}
                className={action.variant !== 'destructive' ? 'bg-white text-gray-900 hover:bg-gray-100' : undefined}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { DataTable };
export type { DataTableProps, BulkAction };
