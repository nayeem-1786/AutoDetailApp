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
import { ArrowUpDown, ChevronUp, ChevronDown, Download } from 'lucide-react';
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
  /** Controlled sorting — when provided, syncs with external state (e.g. useTableState) */
  initialSorting?: { column: string; direction: 'asc' | 'desc' };
  onSortingChange?: (sort: { column: string; direction: 'asc' | 'desc' } | null) => void;
  /** Controlled pagination — when provided, syncs with external state (e.g. useTableState) */
  initialPage?: number;
  initialPageSize?: number;
  onPaginationChange?: (page: number, pageSize: number) => void;
  /** Show page size selector (only when onPaginationChange is provided) */
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  exportFilename,
  bulkActions,
  initialSorting,
  onSortingChange,
  initialPage,
  initialPageSize,
  onPaginationChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTableProps<TData>) {
  // Convert external sort format to TanStack format
  const [sorting, setSortingRaw] = React.useState<SortingState>(
    initialSorting ? [{ id: initialSorting.column, desc: initialSorting.direction === 'desc' }] : []
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Effective page size: use controlled value if provided, otherwise prop
  const effectivePageSize = initialPageSize ?? pageSize;

  // Wrap setSorting to also notify external handler
  const setSorting = React.useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSortingRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (onSortingChange) {
          if (next.length === 0) {
            onSortingChange(null);
          } else {
            onSortingChange({
              column: next[0].id,
              direction: next[0].desc ? 'desc' : 'asc',
            });
          }
        }
        return next;
      });
    },
    [onSortingChange]
  );

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
    initialState: {
      pagination: {
        pageSize: effectivePageSize,
        pageIndex: initialPage ? initialPage - 1 : 0,
      },
    },
    enableRowSelection: !!bulkActions && bulkActions.length > 0,
  });

  // Sync external page/pageSize changes into TanStack table
  React.useEffect(() => {
    if (initialPage !== undefined) {
      table.setPageIndex(initialPage - 1);
    }
  }, [initialPage, table]);

  React.useEffect(() => {
    if (initialPageSize !== undefined) {
      table.setPageSize(initialPageSize);
    }
  }, [initialPageSize, table]);

  const selectedRows = React.useMemo(() => {
    return table.getSelectedRowModel().rows.map((row) => row.original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Handle page change — notify external handler if provided
  const handlePageChange = React.useCallback(
    (page: number) => {
      table.setPageIndex(page - 1);
      onPaginationChange?.(page, table.getState().pagination.pageSize);
    },
    [table, onPaginationChange]
  );

  const handlePageSizeChange = React.useCallback(
    (newSize: number) => {
      table.setPageSize(newSize);
      table.setPageIndex(0);
      onPaginationChange?.(1, newSize);
    },
    [table, onPaginationChange]
  );

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const currentPage = table.getState().pagination.pageIndex + 1;
  const currentPageSize = table.getState().pagination.pageSize;
  const totalRows = data.length;
  const startRow = (currentPage - 1) * currentPageSize + 1;
  const endRow = Math.min(currentPage * currentPageSize, totalRows);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-ui-border bg-ui-bg shadow-ui">
        {exportFilename && (
          <div className="flex justify-end border-b border-ui-border px-4 py-3">
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
                  const sortDir = header.column.getIsSorted(); // 'asc' | 'desc' | false
                  return (
                  <TableHead key={header.id} style={colSize ? { width: colSize } : undefined}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() && 'cursor-pointer select-none',
                          (header.column.columnDef.meta as { headerClassName?: string })?.headerClassName
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          sortDir === 'asc'
                            ? <ChevronUp className="h-4 w-4 text-ui-text" />
                            : sortDir === 'desc'
                              ? <ChevronDown className="h-4 w-4 text-ui-text" />
                              : <ArrowUpDown className="h-3.5 w-3.5 text-ui-text-dim" />
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
        {(table.getPageCount() > 1 || onPaginationChange) && (
          <div className="flex items-center justify-between border-t border-ui-border px-4 py-3">
            <span className="text-xs text-ui-text-dim">
              Showing {startRow}–{endRow} of {totalRows}
            </span>
            <div className="flex items-center gap-3">
              {onPaginationChange && (
                <select
                  value={currentPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-8 rounded border border-ui-input-border bg-ui-input-bg px-2 text-xs text-ui-text"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              )}
              {table.getPageCount() > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={table.getPageCount()}
                  onPageChange={handlePageChange}
                />
              )}
            </div>
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
                className={action.variant !== 'destructive' ? 'bg-ui-bg text-ui-text hover:bg-ui-bg-hover' : undefined}
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
