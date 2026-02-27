'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  GripVertical,
  Pencil,
  X,
  Check,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { useAsyncAction } from '@/lib/hooks/use-async-action';
import type { WebsiteNavItem, WebsitePage, NavPlacement } from '@/lib/supabase/types';

const PLACEMENTS: { value: NavPlacement; label: string }[] = [
  { value: 'header', label: 'Header' },
  { value: 'footer_quick_links', label: 'Footer Quick Links' },
];

const BUILT_IN_ROUTES = [
  { label: 'Services', url: '/services' },
  { label: 'Products', url: '/products' },
  { label: 'Gallery', url: '/gallery' },
  { label: 'Book Now', url: '/book' },
  { label: 'Sign In', url: '/signin' },
  { label: 'My Account', url: '/account' },
  { label: 'Terms & Conditions', url: '/terms' },
];

export default function NavigationPage() {
  const { isSubmitting, execute } = useAsyncAction();
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();
  const [activePlacement, setActivePlacement] = useState<NavPlacement>('header');
  const [items, setItems] = useState<WebsiteNavItem[]>([]);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  // Add dialog state
  const [addLinkType, setAddLinkType] = useState<'custom' | 'page' | 'builtin'>('custom');
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addTarget, setAddTarget] = useState<'_self' | '_blank'>('_self');
  const [addParentId, setAddParentId] = useState('');
  const [addPageId, setAddPageId] = useState('');
  const [addBuiltinIdx, setAddBuiltinIdx] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [navRes, pagesRes] = await Promise.all([
        adminFetch(`/api/admin/cms/navigation?placement=${activePlacement}`),
        adminFetch('/api/admin/cms/pages'),
      ]);
      const navJson = await navRes.json();
      const pagesJson = await pagesRes.json();

      if (navRes.ok) setItems(navJson.data || []);
      if (pagesRes.ok) setPages((pagesJson.data || []).filter((p: WebsitePage) => p.is_published));
    } catch {
      toast.error('Failed to load navigation');
    } finally {
      setLoading(false);
    }
  }, [activePlacement]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const toggleActive = async (item: WebsiteNavItem) => {
    await execute(async () => {
      const newValue = !item.is_active;
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: newValue } : i))
      );

      const res = await adminFetch(`/api/admin/cms/navigation/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newValue }),
      });

      if (!res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_active: !newValue } : i))
        );
        toast.error('Failed to update');
      }
    });
  };

  const deleteItem = (item: WebsiteNavItem) => {
    confirm({
      title: 'Remove Navigation Link',
      description: `Remove "${item.label}" from navigation?`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: async () => {
        await execute(async () => {
          const res = await adminFetch(`/api/admin/cms/navigation/${item.id}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            toast.success('Link removed');
          } else {
            toast.error('Failed to delete');
          }
        });
      },
    });
  };

  const startEdit = (item: WebsiteNavItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditUrl(item.url);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    await execute(async () => {
      const res = await adminFetch(`/api/admin/cms/navigation/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel, url: editUrl }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === editingId ? { ...i, label: editLabel, url: editUrl } : i
          )
        );
        setEditingId(null);
        toast.success('Link updated');
      } else {
        toast.error('Failed to update');
      }
    });
  };

  const handleAdd = async () => {
    let label = addLabel;
    let url = addUrl;
    let pageId: string | null = null;

    if (addLinkType === 'page') {
      const page = pages.find((p) => p.id === addPageId);
      if (!page) {
        toast.error('Select a page');
        return;
      }
      label = label || page.title;
      url = `/p/${page.slug}`;
      pageId = page.id;
    } else if (addLinkType === 'builtin') {
      const route = BUILT_IN_ROUTES[parseInt(addBuiltinIdx)];
      if (!route) {
        toast.error('Select a route');
        return;
      }
      label = label || route.label;
      url = route.url;
    }

    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }

    await execute(async () => {
      const res = await adminFetch('/api/admin/cms/navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placement: activePlacement,
          label: label.trim(),
          url: url || '#',
          page_id: pageId,
          parent_id: addParentId || null,
          target: addTarget,
        }),
      });

      if (res.ok) {
        await loadItems();
        setShowAddDialog(false);
        resetAddForm();
        toast.success('Link added');
      } else {
        toast.error('Failed to add link');
      }
    });
  };

  const resetAddForm = () => {
    setAddLinkType('custom');
    setAddLabel('');
    setAddUrl('');
    setAddTarget('_self');
    setAddParentId('');
    setAddPageId('');
    setAddBuiltinIdx('');
  };

  // Drag and drop reorder
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDragId(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;

    await execute(async () => {
      const oldItems = [...items];
      const dragIdx = items.findIndex((i) => i.id === dragId);
      const targetIdx = items.findIndex((i) => i.id === targetId);

      if (dragIdx === -1 || targetIdx === -1) return;

      const newItems = [...items];
      const [moved] = newItems.splice(dragIdx, 1);
      newItems.splice(targetIdx, 0, moved);
      setItems(newItems);
      setDragId(null);

      const res = await adminFetch('/api/admin/cms/navigation/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placement: activePlacement,
          orderedIds: newItems.map((i) => i.id),
        }),
      });

      if (!res.ok) {
        setItems(oldItems);
        toast.error('Failed to reorder');
      }
    });
  };

  const topLevelItems = items.filter((i) => !i.parent_id);
  const getChildren = (parentId: string) => items.filter((i) => i.parent_id === parentId);

  return (
    <div className="space-y-6">
      <ConfirmDialog {...dialogProps} />
      <PageHeader
        title="Navigation"
        description="Manage header and footer navigation links."
        action={
          <Button onClick={() => setShowAddDialog(true)} disabled={isSubmitting}>
            <Plus className="mr-2 h-4 w-4" />
            Add Link
          </Button>
        }
      />

      {/* Placement tabs */}
      <div className="flex gap-1 border-b">
        {PLACEMENTS.map((p) => (
          <button
            key={p.value}
            onClick={() => setActivePlacement(p.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activePlacement === p.value
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Navigation items list */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500">
          No links yet. Add your first navigation link.
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm divide-y">
          {topLevelItems.map((item) => (
            <div key={item.id}>
              <NavItemRow
                item={item}
                editing={editingId === item.id}
                editLabel={editLabel}
                editUrl={editUrl}
                onEditLabel={setEditLabel}
                onEditUrl={setEditUrl}
                onStartEdit={() => startEdit(item)}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onToggleActive={() => toggleActive(item)}
                onDelete={() => deleteItem(item)}
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item.id)}
                indent={0}
                disabled={isSubmitting}
              />
              {/* Children */}
              {getChildren(item.id).map((child) => (
                <NavItemRow
                  key={child.id}
                  item={child}
                  editing={editingId === child.id}
                  editLabel={editLabel}
                  editUrl={editUrl}
                  onEditLabel={setEditLabel}
                  onEditUrl={setEditUrl}
                  onStartEdit={() => startEdit(child)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onToggleActive={() => toggleActive(child)}
                  onDelete={() => deleteItem(child)}
                  onDragStart={(e) => handleDragStart(e, child.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, child.id)}
                  indent={1}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add Link Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Navigation Link</h3>
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  resetAddForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Link type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'custom', label: 'Custom URL' },
                  { value: 'page', label: 'Existing Page' },
                  { value: 'builtin', label: 'Built-in Route' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAddLinkType(opt.value as typeof addLinkType)}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      addLinkType === opt.value
                        ? 'bg-brand-50 border-brand-300 text-brand-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Page selector */}
            {addLinkType === 'page' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
                <select
                  value={addPageId}
                  onChange={(e) => {
                    setAddPageId(e.target.value);
                    const page = pages.find((p) => p.id === e.target.value);
                    if (page && !addLabel) setAddLabel(page.title);
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a page...</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (/p/{p.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Built-in route selector */}
            {addLinkType === 'builtin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <select
                  value={addBuiltinIdx}
                  onChange={(e) => {
                    setAddBuiltinIdx(e.target.value);
                    const route = BUILT_IN_ROUTES[parseInt(e.target.value)];
                    if (route && !addLabel) setAddLabel(route.label);
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a route...</option>
                  {BUILT_IN_ROUTES.map((r, i) => (
                    <option key={r.url} value={i}>
                      {r.label} ({r.url})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Label */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Link text"
              />
            </div>

            {/* URL (custom only) */}
            {addLinkType === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="text"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="/about or https://..."
                />
              </div>
            )}

            {/* Target */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
              <select
                value={addTarget}
                onChange={(e) => setAddTarget(e.target.value as '_self' | '_blank')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="_self">Same tab</option>
                <option value="_blank">New tab</option>
              </select>
            </div>

            {/* Parent (for nesting) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent</label>
              <select
                value={addParentId}
                onChange={(e) => setAddParentId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">None (top-level)</option>
                {topLevelItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetAddForm();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isSubmitting}>Add Link</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav Item Row
// ---------------------------------------------------------------------------

interface NavItemRowProps {
  item: WebsiteNavItem;
  editing: boolean;
  editLabel: string;
  editUrl: string;
  onEditLabel: (v: string) => void;
  onEditUrl: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  indent: number;
  disabled?: boolean;
}

function NavItemRow({
  item,
  editing,
  editLabel,
  editUrl,
  onEditLabel,
  onEditUrl,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleActive,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  indent,
  disabled,
}: NavItemRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <GripVertical className="h-4 w-4 text-gray-300 cursor-grab flex-shrink-0" />

      <div className="flex-1 min-w-0" style={{ paddingLeft: indent * 24 }}>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editLabel}
              onChange={(e) => onEditLabel(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              autoFocus
            />
            <input
              type="text"
              value={editUrl}
              onChange={(e) => onEditUrl(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button onClick={onSaveEdit} className="text-green-600 hover:text-green-700">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={onCancelEdit} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {indent > 0 && <span className="text-gray-400 text-xs">└</span>}
            <span className="text-sm font-medium text-gray-900">{item.label}</span>
            <span className="text-xs text-gray-400">{item.url}</span>
            {item.target === '_blank' && (
              <ExternalLink className="h-3 w-3 text-gray-400" />
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch
            checked={item.is_active}
            onCheckedChange={onToggleActive}
            disabled={disabled}
          />
          <button
            onClick={onStartEdit}
            disabled={disabled}
            className={`text-gray-400 hover:text-gray-600 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            className={`text-gray-400 hover:text-red-600 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
