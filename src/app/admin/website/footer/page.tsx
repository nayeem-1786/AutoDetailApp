'use client';

import { useState, useEffect, useCallback, useRef, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  GripVertical,
  Pencil,
  X,
  Check,
  ExternalLink,
  Info,
  ImageIcon,
  AlertTriangle,
  Bold,
  Italic,
  Link2,
  SmilePlus,
  Phone,
  Mail,
  MapPin,
  Clock,
  Globe,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Star,
  Heart,
  Shield,
  Award,
  Zap,
  Calendar,
  CreditCard,
  Truck,
  Wrench,
  MessageCircle,
  ThumbsUp,
  Navigation,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type {
  FooterSection,
  FooterColumn,
  FooterBottomLink,
  WebsiteNavItem,
} from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColumnWithLinks extends FooterColumn {
  links: WebsiteNavItem[];
}

// ---------------------------------------------------------------------------
// Helpers — span calculation
// ---------------------------------------------------------------------------

function getSpanTotal(columns: ColumnWithLinks[]): number {
  return columns.reduce((sum, c) => sum + ((c.config?.col_span as number) || 0), 0);
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FooterAdminPage() {
  const [sections, setSections] = useState<FooterSection[]>([]);
  const [columns, setColumns] = useState<ColumnWithLinks[]>([]);
  const [bottomLinks, setBottomLinks] = useState<FooterBottomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    main: true,
    service_areas: true,
    bottom_bar: true,
  });

  const loadData = useCallback(async () => {
    try {
      const [sectionsRes, columnsRes, bottomRes] = await Promise.all([
        adminFetch('/api/admin/footer/sections'),
        adminFetch('/api/admin/footer/columns'),
        adminFetch('/api/admin/footer/bottom-links'),
      ]);

      const sectionsJson = await sectionsRes.json();
      const columnsJson = await columnsRes.json();
      const bottomJson = await bottomRes.json();

      if (sectionsRes.ok) setSections(sectionsJson.data ?? []);
      if (columnsRes.ok) {
        const cols: ColumnWithLinks[] = (columnsJson.data ?? []).map(
          (c: FooterColumn) => ({ ...c, config: c.config || {}, links: [] })
        );
        // Load links for each links-type column
        const linkCols = cols.filter((c) => c.content_type === 'links');
        const linkResults = await Promise.all(
          linkCols.map((c) =>
            adminFetch(`/api/admin/footer/columns/${c.id}/links`).then((r) => r.json())
          )
        );
        linkCols.forEach((col, i) => {
          col.links = linkResults[i]?.data ?? [];
        });
        setColumns(cols);
      }
      if (bottomRes.ok) setBottomLinks(bottomJson.data ?? []);
    } catch {
      toast.error('Failed to load footer data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSectionEnabled = async (section: FooterSection) => {
    const newVal = !section.is_enabled;
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, is_enabled: newVal } : s))
    );

    const res = await adminFetch('/api/admin/footer/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: section.id, is_enabled: newVal }),
    });

    if (res.ok) {
      toast.success(`${section.label} ${newVal ? 'enabled' : 'disabled'}`);
    } else {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, is_enabled: !newVal } : s))
      );
      toast.error('Failed to update section');
    }
  };

  const mainSection = sections.find((s) => s.section_key === 'main');
  const serviceAreasSection = sections.find((s) => s.section_key === 'service_areas');
  const bottomBarSection = sections.find((s) => s.section_key === 'bottom_bar');

  const mainSectionId = mainSection?.id;
  const mainColumns = columns.filter((c) => c.section_id === mainSectionId);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Footer"
          description="Configure each section of your site footer."
        />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Footer"
        description="Configure each section of your site footer."
      />

      <p className="text-xs text-gray-500">
        Changes may take up to 60 seconds to appear on the live site.
      </p>

      {/* Main Footer Section */}
      {mainSection && (
        <SectionCard
          section={mainSection}
          expanded={expandedSections.main}
          onToggleExpand={() => toggleSection('main')}
          onToggleEnabled={() => toggleSectionEnabled(mainSection)}
        >
          <MainFooterPanel
            sectionId={mainSection.id}
            columns={mainColumns}
            setColumns={setColumns}
          />
        </SectionCard>
      )}

      {/* Service Areas Section */}
      {serviceAreasSection && (
        <SectionCard
          section={serviceAreasSection}
          expanded={expandedSections.service_areas}
          onToggleExpand={() => toggleSection('service_areas')}
          onToggleEnabled={() => toggleSectionEnabled(serviceAreasSection)}
        >
          <ServiceAreasPanel section={serviceAreasSection} setSections={setSections} />
        </SectionCard>
      )}

      {/* Bottom Bar Section */}
      {bottomBarSection && (
        <SectionCard
          section={bottomBarSection}
          expanded={expandedSections.bottom_bar}
          onToggleExpand={() => toggleSection('bottom_bar')}
          onToggleEnabled={() => toggleSectionEnabled(bottomBarSection)}
        >
          <BottomBarPanel
            section={bottomBarSection}
            setSections={setSections}
            bottomLinks={bottomLinks}
            setBottomLinks={setBottomLinks}
          />
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card — collapsible wrapper with enable/disable toggle
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  children,
}: {
  section: FooterSection;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
          <h2 className="text-base font-semibold text-gray-900">{section.label}</h2>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-gray-500">
            {section.is_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={section.is_enabled}
            onCheckedChange={onToggleEnabled}
          />
        </div>
      </div>
      {expanded && (
        <CardContent className="border-t border-gray-100 pt-6">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Column Width Preview — visual bar showing proportional widths
// ---------------------------------------------------------------------------

function ColumnWidthPreview({ columns }: { columns: ColumnWithLinks[] }) {
  const enabledCols = columns.filter((c) => c.is_enabled);
  const total = getSpanTotal(enabledCols);
  const isValid = total === 12;

  if (enabledCols.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Column Width Preview
        </h4>
        <span className={`text-xs font-medium ${isValid ? 'text-green-600' : 'text-amber-600'}`}>
          Total: {total} / 12 {isValid ? '\u2713' : '\u2717'}
        </span>
      </div>

      {/* Visual bars */}
      <div className="flex gap-1 h-10 rounded overflow-hidden">
        {enabledCols.map((col) => {
          const span = (col.config?.col_span as number) || 1;
          const pct = (span / 12) * 100;
          const label =
            col.content_type === 'brand'
              ? 'Brand'
              : col.title || col.content_type;
          return (
            <div
              key={col.id}
              className="bg-brand-100 border border-brand-200 rounded flex items-center justify-center overflow-hidden"
              style={{ width: `${pct}%` }}
            >
              <span className="text-[10px] font-medium text-brand-700 truncate px-1">
                {label} ({span})
              </span>
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Column widths must total 12. Adjust the spans below.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Footer Panel — Column management with width controls
// ---------------------------------------------------------------------------

function MainFooterPanel({
  sectionId,
  columns,
  setColumns,
}: {
  sectionId: string;
  columns: ColumnWithLinks[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnWithLinks[]>>;
}) {
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnType, setNewColumnType] = useState<'links' | 'html' | 'business_info'>('links');
  const [dragColId, setDragColId] = useState<string | null>(null);

  const addColumn = async () => {
    if (!newColumnTitle.trim()) {
      toast.error('Title is required');
      return;
    }

    // Calculate remaining span from enabled columns
    const activeSpan = getSpanTotal(columns.filter((c) => c.is_enabled));
    const remainingSpan = 12 - activeSpan;
    const newColSpan = Math.max(2, Math.min(remainingSpan, 4)); // default 4, min 2, max remaining

    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_id: sectionId,
        title: newColumnTitle.trim(),
        content_type: newColumnType,
        config: { col_span: newColSpan },
      }),
    });

    if (res.ok) {
      const { data } = await res.json();
      const newCol: ColumnWithLinks = { ...data, config: data.config || {}, links: [] };
      setColumns((prev) => {
        const otherCols = prev.filter((c) => c.section_id !== sectionId);
        return [...otherCols, ...columns, newCol];
      });
      setNewColumnTitle('');
      setNewColumnType('links');
      setShowAddColumn(false);
      toast.success('Column added');
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to add column');
    }
  };

  const deleteColumn = async (col: ColumnWithLinks) => {
    if (col.content_type === 'brand') {
      if (
        !confirm(
          'The brand column contains your logo and business info. Are you sure you want to remove it?'
        )
      )
        return;
    } else {
      const linkCount = col.links?.length ?? 0;
      const msg =
        linkCount > 0
          ? `This will remove the "${col.title}" column and unassign ${linkCount} link${linkCount > 1 ? 's' : ''}. The links won't be deleted but will no longer appear in the footer.`
          : `Delete the "${col.title}" column?`;
      if (!confirm(msg)) return;
    }

    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: col.id }),
    });

    if (res.ok) {
      // Remove column — do NOT redistribute spans (freed space stays available)
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      toast.success('Column deleted');
    } else {
      toast.error('Failed to delete column');
    }
  };

  const toggleColumnEnabled = async (col: ColumnWithLinks) => {
    const newVal = !col.is_enabled;

    // When enabling, check if adding this column's span would exceed 12
    if (newVal) {
      const currentActiveSpan = getSpanTotal(columns.filter((c) => c.is_enabled));
      const colSpan = (col.config?.col_span as number) || 3;
      if (currentActiveSpan + colSpan > 12) {
        toast.error(
          `Enabling this column would use ${currentActiveSpan + colSpan} of 12 grid units. Shrink or disable other columns first.`
        );
        return;
      }
    }

    setColumns((prev) =>
      prev.map((c) => (c.id === col.id ? { ...c, is_enabled: newVal } : c))
    );

    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: col.id, is_enabled: newVal }),
    });

    if (!res.ok) {
      setColumns((prev) =>
        prev.map((c) => (c.id === col.id ? { ...c, is_enabled: !newVal } : c))
      );
      toast.error('Failed to update column');
    }
  };

  const updateColumnConfig = async (col: ColumnWithLinks, newConfig: Record<string, unknown>) => {
    const mergedConfig = { ...col.config, ...newConfig };
    setColumns((prev) =>
      prev.map((c) => (c.id === col.id ? { ...c, config: mergedConfig } : c))
    );

    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: col.id, config: mergedConfig }),
    });

    if (!res.ok) {
      setColumns((prev) =>
        prev.map((c) => (c.id === col.id ? { ...c, config: col.config } : c))
      );
      toast.error('Failed to save config');
    }
  };

  // Drag & drop reorder columns
  const handleColDragStart = (e: React.DragEvent, id: string) => {
    setDragColId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleColDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragColId || dragColId === targetId) return;

    const oldCols = [...columns];
    const allCols = columns.filter((c) => c.section_id === sectionId);
    const otherCols = columns.filter((c) => c.section_id !== sectionId);

    const dragIdx = allCols.findIndex((c) => c.id === dragColId);
    const targetIdx = allCols.findIndex((c) => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const newCols = [...allCols];
    const [moved] = newCols.splice(dragIdx, 1);
    newCols.splice(targetIdx, 0, moved);

    const reorderedWithSort = newCols.map((c, i) => ({ ...c, sort_order: i }));
    setColumns([...otherCols, ...reorderedWithSort]);
    setDragColId(null);

    const res = await adminFetch('/api/admin/footer/columns/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: reorderedWithSort.map((c) => ({ id: c.id, sort_order: c.sort_order })),
      }),
    });

    if (!res.ok) {
      setColumns(oldCols);
      toast.error('Failed to reorder');
    }
  };

  // Content type options for new columns — exclude 'brand' if one already exists
  const contentTypeOptions: { value: 'links' | 'html' | 'business_info'; label: string }[] = [
    { value: 'links', label: 'Links' },
    { value: 'html', label: 'HTML' },
    { value: 'business_info', label: 'Business Info' },
  ];

  return (
    <div className="space-y-4">
      {/* Width preview */}
      <ColumnWidthPreview columns={columns} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {(() => {
            const enabledCols = columns.filter((c) => c.is_enabled);
            const disabledCount = columns.length - enabledCols.length;
            const spanUsed = getSpanTotal(enabledCols);
            return (
              <>
                {enabledCols.length} active column{enabledCols.length !== 1 ? 's' : ''}
                {' \u00b7 '}
                {spanUsed} of 12 grid units used
                {disabledCount > 0 && (
                  <span className="text-gray-400">
                    {' \u00b7 '}{disabledCount} disabled
                  </span>
                )}
              </>
            );
          })()}
        </p>
        {(() => {
          const activeSpan = getSpanTotal(columns.filter((c) => c.is_enabled));
          const canAdd = activeSpan <= 10; // room for at least a span-2 column
          return (
            <Button
              size="sm"
              onClick={() => setShowAddColumn(true)}
              disabled={!canAdd}
              title={!canAdd ? 'Disable or shrink an existing column to make room' : undefined}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Column
            </Button>
          );
        })()}
      </div>

      {/* Add column form */}
      {showAddColumn && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Column Title
            </label>
            <input
              type="text"
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="e.g. Quick Links, About Us"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content Type
            </label>
            <div className="flex gap-2">
              {contentTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewColumnType(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    newColumnType === opt.value
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddColumn(false);
                setNewColumnTitle('');
                setNewColumnType('links');
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={addColumn}>
              Add Column
            </Button>
          </div>
        </div>
      )}

      {/* Column list */}
      {columns.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          No columns yet. Add your first column above.
        </p>
      ) : (
        <div className="space-y-3">
          {columns
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((col) => (
              <ColumnCard
                key={col.id}
                column={col}
                setColumns={setColumns}
                onDelete={() => deleteColumn(col)}
                onToggleEnabled={() => toggleColumnEnabled(col)}
                onUpdateConfig={(newConfig) => updateColumnConfig(col, newConfig)}
                onDragStart={(e) => handleColDragStart(e, col.id)}
                onDragOver={handleColDragOver}
                onDrop={(e) => handleColDrop(e, col.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column Card — individual column with its content editor
// ---------------------------------------------------------------------------

const CONTENT_TYPE_BADGE: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  links: { label: 'Links', variant: 'info' },
  html: { label: 'HTML', variant: 'default' },
  business_info: { label: 'Business Info', variant: 'success' },
  brand: { label: 'Brand', variant: 'warning' },
};

function ColumnCard({
  column,
  setColumns,
  onDelete,
  onToggleEnabled,
  onUpdateConfig,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  column: ColumnWithLinks;
  setColumns: React.Dispatch<React.SetStateAction<ColumnWithLinks[]>>;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onUpdateConfig: (config: Record<string, unknown>) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(column.title);
  const badge = CONTENT_TYPE_BADGE[column.content_type] ?? CONTENT_TYPE_BADGE.links;
  const isBrand = column.content_type === 'brand';
  const colSpan = (column.config?.col_span as number) || 4;

  const saveTitle = async () => {
    if (!titleValue.trim()) {
      toast.error('Title is required');
      return;
    }

    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: column.id, title: titleValue.trim() }),
    });

    if (res.ok) {
      setColumns((prev) =>
        prev.map((c) =>
          c.id === column.id ? { ...c, title: titleValue.trim() } : c
        )
      );
      setEditingTitle(false);
      toast.success('Title updated');
    } else {
      toast.error('Failed to update title');
    }
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 overflow-hidden"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <GripVertical className="h-4 w-4 text-gray-300 cursor-grab flex-shrink-0" />

        {editingTitle && !isBrand ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setEditingTitle(false);
                  setTitleValue(column.title);
                }
              }}
            />
            <button onClick={saveTitle} className="text-green-600 hover:text-green-700">
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setEditingTitle(false);
                setTitleValue(column.title);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-sm font-medium text-gray-900 flex-1">
              {isBrand ? 'Brand / Logo' : column.title}
            </span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </>
        )}

        {!editingTitle && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Column width span control */}
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-400 uppercase">Span</label>
              <input
                type="number"
                value={colSpan}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(12, parseInt(e.target.value) || 1));
                  onUpdateConfig({ col_span: val });
                }}
                className="w-12 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                min={1}
                max={12}
              />
            </div>
            <Switch
              checked={column.is_enabled}
              onCheckedChange={onToggleEnabled}
            />
            {!isBrand && (
              <button
                onClick={() => {
                  setEditingTitle(true);
                  setTitleValue(column.title);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Edit title"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Delete column"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Column content */}
      <div className="p-4">
        {column.content_type === 'brand' && (
          <BrandColumnEditor column={column} onUpdateConfig={onUpdateConfig} />
        )}
        {column.content_type === 'links' && (
          <LinksEditor column={column} setColumns={setColumns} />
        )}
        {column.content_type === 'html' && (
          <HtmlEditor column={column} setColumns={setColumns} />
        )}
        {column.content_type === 'business_info' && <BusinessInfoPreview />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand Column Editor — logo size, tagline, toggle checkboxes
// ---------------------------------------------------------------------------

function BrandColumnEditor({
  column,
  onUpdateConfig,
}: {
  column: ColumnWithLinks;
  onUpdateConfig: (config: Record<string, unknown>) => void;
}) {
  const config = column.config || {};
  const [logoWidth, setLogoWidth] = useState((config.logo_width as number) || 160);
  const [tagline, setTagline] = useState((config.tagline as string) || '');
  const [showPhone, setShowPhone] = useState(config.show_phone !== false);
  const [showEmail, setShowEmail] = useState(config.show_email !== false);
  const [showAddress, setShowAddress] = useState(config.show_address !== false);
  const [showReviews, setShowReviews] = useState(config.show_reviews !== false);
  const [saving, setSaving] = useState(false);

  const isDirty =
    logoWidth !== ((config.logo_width as number) || 160) ||
    tagline !== ((config.tagline as string) || '') ||
    showPhone !== (config.show_phone !== false) ||
    showEmail !== (config.show_email !== false) ||
    showAddress !== (config.show_address !== false) ||
    showReviews !== (config.show_reviews !== false);

  const save = () => {
    setSaving(true);
    onUpdateConfig({
      logo_width: logoWidth,
      tagline,
      show_phone: showPhone,
      show_email: showEmail,
      show_address: showAddress,
      show_reviews: showReviews,
    });
    setSaving(false);
    toast.success('Brand settings saved');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Logo and business info are pulled from your{' '}
          <Link
            href="/admin/settings"
            className="font-medium underline hover:text-blue-800"
          >
            business settings
          </Link>
          .
        </p>
      </div>

      {/* Logo width */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <ImageIcon className="h-3.5 w-3.5 inline mr-1" />
          Logo Width (px)
        </label>
        <input
          type="number"
          value={logoWidth}
          onChange={(e) => setLogoWidth(Math.max(40, Math.min(400, parseInt(e.target.value) || 160)))}
          className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          min={40}
          max={400}
        />
        <p className="mt-1 text-xs text-gray-500">Height scales automatically.</p>
      </div>

      {/* Tagline */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tagline
        </label>
        <textarea
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Professional auto detailing..."
        />
      </div>

      {/* Toggle checkboxes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Show / Hide
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'phone', label: 'Phone', value: showPhone, setter: setShowPhone },
            { key: 'email', label: 'Email', value: showEmail, setter: setShowEmail },
            { key: 'address', label: 'Address', value: showAddress, setter: setShowAddress },
            { key: 'reviews', label: 'Review Badges', value: showReviews, setter: setShowReviews },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={item.value}
                onChange={(e) => item.setter(e.target.checked)}
                className="rounded border-gray-300"
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      {isDirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Brand Settings'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Links Editor — manage links within a column
// ---------------------------------------------------------------------------

function LinksEditor({
  column,
  setColumns,
}: {
  column: ColumnWithLinks;
  setColumns: React.Dispatch<React.SetStateAction<ColumnWithLinks[]>>;
}) {
  const [showAddLink, setShowAddLink] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addNewTab, setAddNewTab] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [dragLinkId, setDragLinkId] = useState<string | null>(null);

  const links = column.links ?? [];

  const updateColumnLinks = (newLinks: WebsiteNavItem[]) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === column.id ? { ...c, links: newLinks } : c))
    );
  };

  const addLink = async () => {
    if (!addLabel.trim()) {
      toast.error('Label is required');
      return;
    }

    const res = await adminFetch(`/api/admin/footer/columns/${column.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: addLabel.trim(),
        url: addUrl.trim() || '#',
        target: addNewTab ? '_blank' : '_self',
      }),
    });

    if (res.ok) {
      const { data } = await res.json();
      updateColumnLinks([...links, data]);
      setAddLabel('');
      setAddUrl('');
      setAddNewTab(false);
      setShowAddLink(false);
      toast.success('Link added');
    } else {
      toast.error('Failed to add link');
    }
  };

  const deleteLink = async (linkId: string) => {
    const res = await adminFetch(`/api/admin/footer/columns/${column.id}/links`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: linkId }),
    });

    if (res.ok) {
      updateColumnLinks(links.filter((l) => l.id !== linkId));
      toast.success('Link removed');
    } else {
      toast.error('Failed to delete link');
    }
  };

  const startEditLink = (link: WebsiteNavItem) => {
    setEditingLinkId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
  };

  const saveEditLink = async () => {
    if (!editingLinkId || !editLabel.trim()) return;

    const res = await adminFetch(`/api/admin/footer/columns/${column.id}/links`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingLinkId,
        label: editLabel.trim(),
        url: editUrl.trim() || '#',
      }),
    });

    if (res.ok) {
      updateColumnLinks(
        links.map((l) =>
          l.id === editingLinkId
            ? { ...l, label: editLabel.trim(), url: editUrl.trim() || '#' }
            : l
        )
      );
      setEditingLinkId(null);
      toast.success('Link updated');
    } else {
      toast.error('Failed to update link');
    }
  };

  const toggleLinkActive = async (link: WebsiteNavItem) => {
    const newVal = !link.is_active;
    updateColumnLinks(
      links.map((l) => (l.id === link.id ? { ...l, is_active: newVal } : l))
    );

    const res = await adminFetch(`/api/admin/footer/columns/${column.id}/links`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: link.id, is_active: newVal }),
    });

    if (!res.ok) {
      updateColumnLinks(
        links.map((l) => (l.id === link.id ? { ...l, is_active: !newVal } : l))
      );
      toast.error('Failed to update link');
    }
  };

  // Drag & drop reorder links
  const handleLinkDragStart = (e: React.DragEvent, id: string) => {
    setDragLinkId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleLinkDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleLinkDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragLinkId || dragLinkId === targetId) return;

    const oldLinks = [...links];
    const dragIdx = links.findIndex((l) => l.id === dragLinkId);
    const targetIdx = links.findIndex((l) => l.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const newLinks = [...links];
    const [moved] = newLinks.splice(dragIdx, 1);
    newLinks.splice(targetIdx, 0, moved);
    updateColumnLinks(newLinks);
    setDragLinkId(null);

    // Reorder API — use the column links PATCH with sort_order updates
    const reorderPayload = newLinks.map((l, i) => ({ id: l.id, sort_order: i }));
    const results = await Promise.all(
      reorderPayload.map((item) =>
        adminFetch(`/api/admin/footer/columns/${column.id}/links`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, sort_order: item.sort_order }),
        })
      )
    );

    if (results.some((r) => !r.ok)) {
      updateColumnLinks(oldLinks);
      toast.error('Failed to reorder links');
    }
  };

  return (
    <div className="space-y-2">
      {links.length === 0 && !showAddLink && (
        <p className="text-sm text-gray-500 py-2">No links yet.</p>
      )}

      {links.map((link) => (
        <div
          key={link.id}
          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group"
          draggable
          onDragStart={(e) => handleLinkDragStart(e, link.id)}
          onDragOver={handleLinkDragOver}
          onDrop={(e) => handleLinkDrop(e, link.id)}
        >
          <GripVertical className="h-3.5 w-3.5 text-gray-300 cursor-grab flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

          {editingLinkId === link.id ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Label"
                autoFocus
              />
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="URL"
              />
              <button onClick={saveEditLink} className="text-green-600 hover:text-green-700">
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditingLinkId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm text-gray-900 flex-1">{link.label}</span>
              <span className="text-xs text-gray-400">{link.url}</span>
              {link.target === '_blank' && (
                <ExternalLink className="h-3 w-3 text-gray-400" />
              )}
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Switch
                  checked={link.is_active}
                  onCheckedChange={() => toggleLinkActive(link)}
                />
                <button
                  onClick={() => startEditLink(link)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteLink(link.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Add link form */}
      {showAddLink ? (
        <div className="bg-gray-50 rounded border border-gray-200 p-3 space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Label
              </label>
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Link text"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                URL
              </label>
              <input
                type="text"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="/about or https://..."
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={addNewTab}
              onChange={(e) => setAddNewTab(e.target.checked)}
              className="rounded border-gray-300"
            />
            Open in new tab
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddLink(false);
                setAddLabel('');
                setAddUrl('');
                setAddNewTab(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={addLink}>
              Add Link
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddLink(true)}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML Editor — textarea for custom HTML content
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Icon Picker — curated Lucide icons for footer HTML editor
// ---------------------------------------------------------------------------

const FOOTER_ICONS: { name: string; icon: LucideIcon; category: string }[] = [
  // Contact
  { name: 'Phone', icon: Phone, category: 'Contact' },
  { name: 'Mail', icon: Mail, category: 'Contact' },
  { name: 'MapPin', icon: MapPin, category: 'Contact' },
  { name: 'Clock', icon: Clock, category: 'Contact' },
  { name: 'Globe', icon: Globe, category: 'Contact' },
  { name: 'MessageCircle', icon: MessageCircle, category: 'Contact' },
  { name: 'Navigation', icon: Navigation, category: 'Contact' },
  // Social
  { name: 'Facebook', icon: Facebook, category: 'Social' },
  { name: 'Instagram', icon: Instagram, category: 'Social' },
  { name: 'Twitter', icon: Twitter, category: 'Social' },
  { name: 'Youtube', icon: Youtube, category: 'Social' },
  // Trust & Badges
  { name: 'Star', icon: Star, category: 'Trust' },
  { name: 'Heart', icon: Heart, category: 'Trust' },
  { name: 'Shield', icon: Shield, category: 'Trust' },
  { name: 'Award', icon: Award, category: 'Trust' },
  { name: 'ThumbsUp', icon: ThumbsUp, category: 'Trust' },
  // Services
  { name: 'Calendar', icon: Calendar, category: 'Services' },
  { name: 'CreditCard', icon: CreditCard, category: 'Services' },
  { name: 'Truck', icon: Truck, category: 'Services' },
  { name: 'Wrench', icon: Wrench, category: 'Services' },
  { name: 'Zap', icon: Zap, category: 'Services' },
];

const ICON_SIZES = [16, 20, 24, 32] as const;
const ICON_COLORS = [
  { label: 'Current', value: 'currentColor' },
  { label: 'White', value: '#ffffff' },
  { label: 'Lime', value: '#CCFF00' },
] as const;

function IconPicker({
  onInsert,
  onClose,
}: {
  onInsert: (svg: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState<number>(20);
  const [selectedColor, setSelectedColor] = useState('currentColor');

  const filtered = search
    ? FOOTER_ICONS.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase())
      )
    : FOOTER_ICONS;

  const categories = [...new Set(filtered.map((i) => i.category))];

  const generateSvg = (iconDef: (typeof FOOTER_ICONS)[number]) => {
    const svgString = renderToStaticMarkup(
      createElement(iconDef.icon, {
        size: selectedSize,
        color: selectedColor,
        strokeWidth: 2,
      })
    );
    // Add inline style for vertical alignment
    return svgString.replace(
      '<svg ',
      `<svg style="display:inline-block;vertical-align:middle" `
    );
  };

  return (
    <div className="absolute z-20 top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Insert Icon</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
      </div>

      {/* Size + Color selectors */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Size</span>
          <div className="flex gap-0.5">
            {ICON_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSize(s)}
                className={`px-1.5 py-0.5 text-xs rounded ${
                  selectedSize === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Color</span>
          <div className="flex gap-1">
            {ICON_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setSelectedColor(c.value)}
                title={c.label}
                className={`h-5 w-5 rounded-full border-2 ${
                  selectedColor === c.value ? 'border-brand-600' : 'border-gray-300'
                }`}
                style={{
                  backgroundColor:
                    c.value === 'currentColor' ? '#6b7280' : c.value,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Icon grid */}
      <div className="max-h-48 overflow-y-auto p-2">
        {categories.map((cat) => (
          <div key={cat} className="mb-2">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1 mb-1">
              {cat}
            </p>
            <div className="grid grid-cols-7 gap-0.5">
              {filtered
                .filter((i) => i.category === cat)
                .map((iconDef) => {
                  const IconComp = iconDef.icon;
                  return (
                    <button
                      key={iconDef.name}
                      title={iconDef.name}
                      onClick={() => {
                        onInsert(generateSvg(iconDef));
                        onClose();
                      }}
                      className="flex items-center justify-center h-9 w-9 rounded hover:bg-gray-100 transition-colors"
                    >
                      <IconComp className="h-5 w-5 text-gray-600" />
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No icons found</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML Editor — textarea with toolbar (Bold, Italic, Link, Icon)
// ---------------------------------------------------------------------------

function HtmlEditor({
  column,
  setColumns,
}: {
  column: ColumnWithLinks;
  setColumns: React.Dispatch<React.SetStateAction<ColumnWithLinks[]>>;
}) {
  const [value, setValue] = useState(column.html_content || '');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDirty = value !== (column.html_content || '');

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setValue((prev) => prev + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    setValue(newValue);
    // Restore cursor after the inserted text
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  };

  const wrapSelection = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.substring(start, end);
    const replacement = before + (selected || 'text') + after;
    const newValue = value.substring(0, start) + replacement + value.substring(end);
    setValue(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      if (selected) {
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + selected.length;
      } else {
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + 4; // select "text"
      }
    });
  };

  const save = async () => {
    setSaving(true);
    const res = await adminFetch('/api/admin/footer/columns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: column.id, html_content: value }),
    });

    if (res.ok) {
      setColumns((prev) =>
        prev.map((c) => (c.id === column.id ? { ...c, html_content: value } : c))
      );
      toast.success('HTML content saved');
    } else {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Use HTML for custom content like business hours, embedded widgets, or formatted text.
      </p>

      {/* Toolbar */}
      <div className="relative flex items-center gap-0.5 border border-gray-300 rounded-t-md bg-gray-50 px-1.5 py-1">
        <button
          type="button"
          title="Bold"
          onClick={() => wrapSelection('<strong>', '</strong>')}
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Italic"
          onClick={() => wrapSelection('<em>', '</em>')}
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Insert Link"
          onClick={() => wrapSelection('<a href="#">', '</a>')}
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <button
          type="button"
          title="Insert Icon"
          onClick={() => setShowIconPicker(!showIconPicker)}
          className={`flex items-center justify-center h-7 w-7 rounded transition-colors ${
            showIconPicker
              ? 'bg-brand-100 text-brand-700'
              : 'hover:bg-gray-200 text-gray-600'
          }`}
        >
          <SmilePlus className="h-4 w-4" />
        </button>
        {showIconPicker && (
          <IconPicker
            onInsert={insertAtCursor}
            onClose={() => setShowIconPicker(false)}
          />
        )}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        className="w-full rounded-b-md border border-t-0 border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        placeholder="<p>Your HTML here...</p>"
      />
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-sm text-brand-600 hover:text-brand-700 transition-colors"
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
        <Button size="sm" onClick={save} disabled={!isDirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
      {showPreview && (
        <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300">
          <p className="text-xs text-gray-500 mb-2">Preview (approximate styling):</p>
          <div
            className="space-y-2 [&_a]:text-green-400 [&_a]:hover:underline"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Business Info Preview — read-only
// ---------------------------------------------------------------------------

function BusinessInfoPreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          This column auto-populates from your{' '}
          <Link
            href="/admin/settings"
            className="font-medium underline hover:text-blue-800"
          >
            business settings
          </Link>
          . It displays your phone number, email, and quick links to Book Appointment and Get a Quote.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Areas Panel
// ---------------------------------------------------------------------------

function ServiceAreasPanel({
  section,
  setSections,
}: {
  section: FooterSection;
  setSections: React.Dispatch<React.SetStateAction<FooterSection[]>>;
}) {
  const config = section.config ?? {};
  const [prefixText, setPrefixText] = useState(
    (config.prefix_text as string) || 'Mobile Detailing in'
  );
  const [saving, setSaving] = useState(false);
  const isDirty = prefixText !== ((config.prefix_text as string) || 'Mobile Detailing in');

  const save = async () => {
    setSaving(true);
    const newConfig = { ...config, prefix_text: prefixText };

    const res = await adminFetch('/api/admin/footer/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: section.id, config: newConfig }),
    });

    if (res.ok) {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, config: newConfig } : s))
      );
      toast.success('Service areas config saved');
    } else {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Prefix Text
        </label>
        <input
          type="text"
          value={prefixText}
          onChange={(e) => setPrefixText(e.target.value)}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          placeholder="Mobile Detailing in"
        />
        <p className="mt-1 text-xs text-gray-500">
          This text appears before the list of cities.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Cities are auto-populated from active service areas.{' '}
          <Link
            href="/admin/website/seo/cities"
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            Manage service areas &rarr;
          </Link>
        </div>
        <Button size="sm" onClick={save} disabled={!isDirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom Bar Panel
// ---------------------------------------------------------------------------

function BottomBarPanel({
  section,
  setSections,
  bottomLinks,
  setBottomLinks,
}: {
  section: FooterSection;
  setSections: React.Dispatch<React.SetStateAction<FooterSection[]>>;
  bottomLinks: FooterBottomLink[];
  setBottomLinks: React.Dispatch<React.SetStateAction<FooterBottomLink[]>>;
}) {
  const config = section.config ?? {};
  const [customCopyright, setCustomCopyright] = useState(
    (config.custom_copyright as string) || ''
  );
  const [savingCopyright, setSavingCopyright] = useState(false);
  const copyrightDirty =
    customCopyright !== ((config.custom_copyright as string) || '');

  const [showAddLink, setShowAddLink] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addNewTab, setAddNewTab] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const saveCopyright = async () => {
    setSavingCopyright(true);
    const newConfig = { ...config, custom_copyright: customCopyright || null };

    const res = await adminFetch('/api/admin/footer/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: section.id, config: newConfig }),
    });

    if (res.ok) {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, config: newConfig } : s))
      );
      toast.success('Copyright text saved');
    } else {
      toast.error('Failed to save');
    }
    setSavingCopyright(false);
  };

  const addBottomLink = async () => {
    if (!addLabel.trim() || !addUrl.trim()) {
      toast.error('Label and URL are required');
      return;
    }

    const res = await adminFetch('/api/admin/footer/bottom-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: addLabel.trim(),
        url: addUrl.trim(),
        open_in_new_tab: addNewTab,
      }),
    });

    if (res.ok) {
      const { data } = await res.json();
      setBottomLinks((prev) => [...prev, data]);
      setAddLabel('');
      setAddUrl('');
      setAddNewTab(false);
      setShowAddLink(false);
      toast.success('Link added');
    } else {
      toast.error('Failed to add link');
    }
  };

  const deleteBottomLink = async (id: string) => {
    const res = await adminFetch('/api/admin/footer/bottom-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setBottomLinks((prev) => prev.filter((l) => l.id !== id));
      toast.success('Link removed');
    } else {
      toast.error('Failed to delete link');
    }
  };

  const toggleBottomLinkEnabled = async (link: FooterBottomLink) => {
    const newVal = !link.is_enabled;
    setBottomLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_enabled: newVal } : l))
    );

    const res = await adminFetch('/api/admin/footer/bottom-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: link.id, is_enabled: newVal }),
    });

    if (!res.ok) {
      setBottomLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, is_enabled: !newVal } : l))
      );
      toast.error('Failed to update link');
    }
  };

  const startEditBottomLink = (link: FooterBottomLink) => {
    setEditingId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
  };

  const saveEditBottomLink = async () => {
    if (!editingId || !editLabel.trim()) return;

    const res = await adminFetch('/api/admin/footer/bottom-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        label: editLabel.trim(),
        url: editUrl.trim() || '#',
      }),
    });

    if (res.ok) {
      setBottomLinks((prev) =>
        prev.map((l) =>
          l.id === editingId
            ? { ...l, label: editLabel.trim(), url: editUrl.trim() || '#' }
            : l
        )
      );
      setEditingId(null);
      toast.success('Link updated');
    } else {
      toast.error('Failed to update link');
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      {/* Copyright */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Copyright</h3>
        <p className="text-sm text-gray-600 mb-3">
          Default: &copy; {year} [Your Business Name]. All rights reserved.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Custom copyright text (optional)
          </label>
          <input
            type="text"
            value={customCopyright}
            onChange={(e) => setCustomCopyright(e.target.value)}
            className="w-full max-w-lg rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder="Leave empty to use auto-generated text"
          />
        </div>
        {copyrightDirty && (
          <div className="mt-2">
            <Button
              size="sm"
              onClick={saveCopyright}
              disabled={savingCopyright}
            >
              {savingCopyright ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* Links */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Links</h3>

        {bottomLinks.length === 0 && !showAddLink && (
          <p className="text-sm text-gray-500 py-2">No bottom bar links yet.</p>
        )}

        <div className="space-y-1">
          {bottomLinks
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group"
              >
                {editingId === link.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                      placeholder="Label"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                      placeholder="URL"
                    />
                    <button
                      onClick={saveEditBottomLink}
                      className="text-green-600 hover:text-green-700"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-gray-900 flex-1">{link.label}</span>
                    <span className="text-xs text-gray-400">{link.url}</span>
                    {link.open_in_new_tab && (
                      <ExternalLink className="h-3 w-3 text-gray-400" />
                    )}
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Switch
                        checked={link.is_enabled}
                        onCheckedChange={() => toggleBottomLinkEnabled(link)}
                      />
                      <button
                        onClick={() => startEditBottomLink(link)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteBottomLink(link.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>

        {/* Add link form */}
        {showAddLink ? (
          <div className="bg-gray-50 rounded border border-gray-200 p-3 space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Privacy Policy"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  URL
                </label>
                <input
                  type="text"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="/privacy or https://..."
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={addNewTab}
                onChange={(e) => setAddNewTab(e.target.checked)}
                className="rounded border-gray-300"
              />
              Open in new tab
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddLink(false);
                  setAddLabel('');
                  setAddUrl('');
                  setAddNewTab(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={addBottomLink}>
                Add Link
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddLink(true)}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 transition-colors mt-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Link
          </button>
        )}
      </div>
    </div>
  );
}
