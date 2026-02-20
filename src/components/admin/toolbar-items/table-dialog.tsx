'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table } from 'lucide-react';

interface TableDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type TableType = 'custom' | 'business_hours' | 'pricing';

const TABLE_TYPES: { value: TableType; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'business_hours', label: 'Business Hours' },
  { value: 'pricing', label: 'Pricing' },
];

function buildCustomTable(rows: number, cols: number, hasHeader: boolean): string {
  let html = '';

  if (hasHeader) {
    html += '<thead><tr>';
    for (let c = 1; c <= cols; c++) {
      html += `<th style="text-align:left;padding:8px 12px;border-bottom:1px solid var(--site-border-medium);color:var(--site-text);font-weight:600;">Header ${c}</th>`;
    }
    html += '</tr></thead>';
  }

  html += '<tbody>';
  const dataRows = hasHeader ? rows - 1 : rows;
  for (let r = 1; r <= dataRows; r++) {
    html += '<tr>';
    for (let c = 1; c <= cols; c++) {
      html += `<td style="padding:8px 12px;border-bottom:1px solid var(--site-border-light);">Row ${r}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';

  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;color:var(--site-text-secondary);font-size:14px;">${html}</table></div>`;
}

function buildBusinessHoursTable(): string {
  const days = [
    { day: 'Monday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Tuesday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Wednesday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Thursday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Friday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Saturday', hours: '9:00 AM - 5:00 PM' },
    { day: 'Sunday', hours: 'Closed' },
  ];

  let rows = '';
  for (const { day, hours } of days) {
    const isClosed = hours === 'Closed';
    const hoursStyle = isClosed
      ? 'text-align:right;padding:8px 12px;border-bottom:1px solid var(--site-border-light);color:var(--site-text-secondary);opacity:0.6;font-style:italic;'
      : 'text-align:right;padding:8px 12px;border-bottom:1px solid var(--site-border-light);';
    rows += `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--site-border-light);font-weight:600;color:var(--site-text);">${day}</td><td style="${hoursStyle}">${hours}</td></tr>`;
  }

  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;color:var(--site-text-secondary);font-size:14px;"><thead><tr><th style="text-align:left;padding:8px 12px;border-bottom:1px solid var(--site-border-medium);color:var(--site-text);font-weight:600;">Day</th><th style="text-align:right;padding:8px 12px;border-bottom:1px solid var(--site-border-medium);color:var(--site-text);font-weight:600;">Hours</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildPricingTable(): string {
  const services = [
    { name: 'Basic Wash', price: '$29' },
    { name: 'Interior Detail', price: '$99' },
    { name: 'Full Detail', price: '$199' },
    { name: 'Ceramic Coating', price: '$499' },
  ];

  let rows = '';
  for (const { name, price } of services) {
    rows += `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--site-border-light);">${name}</td><td style="padding:8px 12px;border-bottom:1px solid var(--site-border-light);text-align:right;color:var(--lime);font-weight:600;">${price}</td></tr>`;
  }

  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;color:var(--site-text-secondary);font-size:14px;"><thead><tr><th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--lime);color:var(--site-text);font-weight:600;">Service</th><th style="text-align:right;padding:8px 12px;border-bottom:2px solid var(--lime);color:var(--site-text);font-weight:600;">Price</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function TableDialog({ open, onClose, onInsert }: TableDialogProps) {
  const [tableType, setTableType] = useState<TableType>('custom');
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);

  function handleInsert() {
    let html: string;

    switch (tableType) {
      case 'business_hours':
        html = buildBusinessHoursTable();
        break;
      case 'pricing':
        html = buildPricingTable();
        break;
      default:
        html = buildCustomTable(rows, cols, hasHeader);
        break;
    }

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setTableType('custom');
    setRows(3);
    setCols(3);
    setHasHeader(true);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Table className="h-5 w-5" />
          Insert Table
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Table Type
            </label>
            <div className="flex gap-2">
              {TABLE_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTableType(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    tableType === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {tableType === 'custom' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ui-text">
                    Rows
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={rows}
                    onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ui-text">
                    Columns
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={cols}
                    onChange={(e) => setCols(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ui-text">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="rounded border-ui-border"
                />
                Include header row
              </label>
            </>
          )}

          {tableType === 'business_hours' && (
            <p className="text-xs text-ui-text-muted">
              Generates a 7-day business hours table (Mon-Sun) with editable times. Sunday defaults to &quot;Closed&quot;.
            </p>
          )}

          {tableType === 'pricing' && (
            <p className="text-xs text-ui-text-muted">
              Generates a service/price table with accent-colored prices. Edit the content after inserting.
            </p>
          )}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert}>
          Insert Table
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
