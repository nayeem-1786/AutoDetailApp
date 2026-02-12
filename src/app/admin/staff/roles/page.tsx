'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { cn } from '@/lib/utils/cn';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import {
  Shield,
  Lock,
  Trash2,
  Plus,
  Users,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  Pencil,
  RotateCcw,
} from 'lucide-react';

// Types matching API response
interface RoleData {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_super: boolean;
  can_access_pos: boolean;
  permissions: Record<string, boolean>;
  employee_count: number;
}

interface PermDef {
  key: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
}

// Group permission definitions by category
function groupByCategory(defs: PermDef[]): Record<string, PermDef[]> {
  const groups: Record<string, PermDef[]> = {};
  for (const def of defs) {
    if (!groups[def.category]) groups[def.category] = [];
    groups[def.category].push(def);
  }
  return groups;
}

// Get sorted category names
function getSortedCategories(groups: Record<string, PermDef[]>): string[] {
  return Object.keys(groups).sort((a, b) => {
    const aMin = Math.min(...groups[a].map((d) => d.sort_order));
    const bMin = Math.min(...groups[b].map((d) => d.sort_order));
    return aMin - bMin;
  });
}

// Sort roles: cashier, detailer, custom roles (alpha), admin, super_admin
const SYSTEM_ROLE_ORDER: Record<string, number> = {
  cashier: 0,
  detailer: 1,
  admin: 98,
  super_admin: 99,
};

function sortRoles(roles: RoleData[]): RoleData[] {
  return [...roles].sort((a, b) => {
    const aOrder = SYSTEM_ROLE_ORDER[a.name] ?? 50;
    const bOrder = SYSTEM_ROLE_ORDER[b.name] ?? 50;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.display_name.localeCompare(b.display_name);
  });
}

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [permDefs, setPermDefs] = useState<PermDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Permission editing state
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChangesRef = useRef<Record<string, boolean>>({});

  // Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Create role dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [copyFromRole, setCopyFromRole] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete role dialog
  const [deleteRole, setDeleteRole] = useState<RoleData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset to defaults
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Inline edit role name
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || null;

  const fetchRoles = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/staff/roles');
      if (!response.ok) {
        const json = await response.json();
        toast.error('Failed to load roles', { description: json.error });
        return;
      }
      const data = await response.json();
      const sorted = sortRoles(data.roles);
      setRoles(sorted);
      setPermDefs(data.permission_definitions);

      // Auto-select first role (Cashier after sorting) if none selected
      if (!selectedRoleId && sorted.length > 0) {
        setSelectedRoleId(sorted[0].id);
        setLocalPerms(sorted[0].permissions);
      }
    } catch {
      toast.error('Network error loading roles');
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Update local perms when selected role changes
  useEffect(() => {
    if (selectedRole) {
      setLocalPerms({ ...selectedRole.permissions });
      pendingChangesRef.current = {};
      setEditingName(false);
    }
  }, [selectedRole]);

  // Default all categories to collapsed on load
  useEffect(() => {
    if (permDefs.length > 0) {
      const allCategories = Object.keys(groupByCategory(permDefs));
      setCollapsedCategories(new Set(allCategories));
    }
  }, [permDefs]);

  // Focus name input when editing starts
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  // Flush pending changes to API
  const flushChanges = useCallback(async () => {
    if (!selectedRoleId || Object.keys(pendingChangesRef.current).length === 0) return;

    const changes = { ...pendingChangesRef.current };
    pendingChangesRef.current = {};
    setSaving(true);

    try {
      const response = await adminFetch(`/api/admin/staff/roles/${selectedRoleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: changes }),
      });

      if (!response.ok) {
        const json = await response.json();
        toast.error('Failed to save permissions', { description: json.error });
        if (selectedRole) {
          setLocalPerms({ ...selectedRole.permissions });
        }
        return;
      }

      // Update the role data in-memory
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRoleId
            ? { ...r, permissions: { ...r.permissions, ...changes } }
            : r
        )
      );
    } catch {
      toast.error('Network error saving permissions');
      if (selectedRole) {
        setLocalPerms({ ...selectedRole.permissions });
      }
    } finally {
      setSaving(false);
    }
  }, [selectedRoleId, selectedRole]);

  // Toggle a single permission (optimistic + debounced save)
  function handleTogglePerm(key: string, newValue: boolean) {
    if (!selectedRole || selectedRole.is_super) return;

    setLocalPerms((prev) => ({ ...prev, [key]: newValue }));
    pendingChangesRef.current[key] = newValue;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushChanges();
    }, 300);
  }

  // Toggle all permissions in a category
  function handleToggleCategory(category: string, value: boolean) {
    if (!selectedRole || selectedRole.is_super) return;

    const categoryDefs = permDefs.filter((d) => d.category === category);
    const updates: Record<string, boolean> = {};
    for (const def of categoryDefs) {
      updates[def.key] = value;
    }

    setLocalPerms((prev) => ({ ...prev, ...updates }));
    Object.assign(pendingChangesRef.current, updates);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushChanges();
    }, 300);
  }

  // Toggle category collapse
  function toggleCollapse(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  // Create role handler
  async function handleCreateRole() {
    if (!createName.trim()) return;

    setCreating(true);
    try {
      let perms: Record<string, boolean> = {};
      if (copyFromRole) {
        const sourceRole = roles.find((r) => r.id === copyFromRole);
        if (sourceRole) {
          perms = { ...sourceRole.permissions };
        }
      }

      const response = await adminFetch('/api/admin/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: createName.trim(),
          description: createDesc.trim() || null,
          permissions: perms,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error('Failed to create role', { description: json.error });
        return;
      }

      toast.success(`Role "${createName.trim()}" created`);
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      setCopyFromRole('');

      setSelectedRoleId(json.data.id);
      setLoading(true);
      await fetchRoles();
    } catch {
      toast.error('Network error creating role');
    } finally {
      setCreating(false);
    }
  }

  // Delete role handler
  async function handleDeleteRole() {
    if (!deleteRole) return;

    setDeleting(true);
    try {
      const response = await adminFetch(`/api/admin/staff/roles/${deleteRole.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const json = await response.json();
        toast.error('Failed to delete role', { description: json.error });
        return;
      }

      toast.success(`Role "${deleteRole.display_name}" deleted`);
      setDeleteRole(null);

      const remaining = roles.filter((r) => r.id !== deleteRole.id);
      setSelectedRoleId(remaining[0]?.id || null);
      setLoading(true);
      await fetchRoles();
    } catch {
      toast.error('Network error deleting role');
    } finally {
      setDeleting(false);
    }
  }

  // Reset to defaults handler
  async function handleResetDefaults() {
    if (!selectedRole) return;

    setResetting(true);
    try {
      const response = await adminFetch(`/api/admin/staff/roles/${selectedRole.id}/reset`, {
        method: 'POST',
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error('Failed to reset permissions', { description: json.error });
        return;
      }

      const resetPerms = json.permissions as Record<string, boolean>;
      setLocalPerms(resetPerms);
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id
            ? { ...r, permissions: resetPerms }
            : r
        )
      );

      toast.success('Permissions reset to defaults');
      setShowResetConfirm(false);
    } catch {
      toast.error('Network error resetting permissions');
    } finally {
      setResetting(false);
    }
  }

  // Save role display name
  async function handleSaveName() {
    if (!selectedRole || !editNameValue.trim() || editNameValue.trim() === selectedRole.display_name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const response = await adminFetch(`/api/admin/staff/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editNameValue.trim() }),
      });

      if (!response.ok) {
        const json = await response.json();
        toast.error('Failed to update name', { description: json.error });
        return;
      }

      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id
            ? { ...r, display_name: editNameValue.trim() }
            : r
        )
      );
      toast.success('Role name updated');
    } catch {
      toast.error('Network error');
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  }

  // Computed
  const grouped = groupByCategory(permDefs);
  const sortedCategories = getSortedCategories(grouped);

  const totalGranted = permDefs.filter((d) =>
    selectedRole?.is_super ? true : localPerms[d.key] === true
  ).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Role Management"
          description="Manage roles and their default permissions"
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
        title="Role Management"
        description="Manage roles and their default permissions"
        action={
          <div className="flex items-center gap-2">
            {selectedRole && !selectedRole.is_system && selectedRole.employee_count === 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteRole(selectedRole)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete Role
              </Button>
            )}
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Role
            </Button>
          </div>
        }
      />

      {/* Role selection via Tabs */}
      <Tabs
        value={selectedRoleId || ''}
        onValueChange={(id) => setSelectedRoleId(id)}
      >
        <TabsList>
          {roles.map((role) => (
            <TabsTrigger key={role.id} value={role.id}>
              <div className="flex items-center gap-1.5">
                {role.is_super && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                <span>{role.display_name}</span>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {roles.map((role) => (
          <TabsContent key={role.id} value={role.id}>
            <div className="space-y-6">
              {/* Super Admin Notice */}
              {role.is_super && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Lock className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Super Admin bypasses all permission checks. All permissions are always granted and cannot be modified.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Role Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {editingName && !role.is_system ? (
                          <div className="flex items-center gap-2">
                            <Input
                              ref={nameInputRef}
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveName();
                                if (e.key === 'Escape') setEditingName(false);
                              }}
                              onBlur={handleSaveName}
                              className="h-8 w-48 text-sm font-semibold"
                              disabled={savingName}
                            />
                            {savingName && (
                              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm font-semibold">{role.display_name}</CardTitle>
                            {role.is_system ? (
                              <span title="System role names cannot be changed">
                                <Lock className="h-3.5 w-3.5 text-gray-400" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditNameValue(role.display_name);
                                  setEditingName(true);
                                }}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Edit role name"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        {saving && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                      {role.description && (
                        <p className="mt-1 text-xs text-gray-500">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {role.is_system && (
                        <Badge variant="secondary">System</Badge>
                      )}
                      <Badge variant="info">
                        <Users className="mr-1 h-3 w-3" />
                        {role.employee_count} employee{role.employee_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Permissions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-semibold">Permissions</CardTitle>
                      <Badge variant="secondary">
                        {totalGranted} of {permDefs.length} granted
                      </Badge>
                    </div>
                    {!role.is_super && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirm(true)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {role.is_system ? 'Reset to Defaults' : 'Reset to All Denied'}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {role.is_super
                      ? 'All permissions are granted for Super Admin.'
                      : 'Toggle permissions on or off. Use category controls for bulk changes.'}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sortedCategories.map((category) => {
                      const defs = grouped[category];
                      const isCollapsed = collapsedCategories.has(category);
                      const grantedCount = defs.filter((d) =>
                        role.is_super ? true : localPerms[d.key] === true
                      ).length;
                      const allGranted = !role.is_super && grantedCount === defs.length;
                      const allDenied = !role.is_super && grantedCount === 0;

                      return (
                        <div key={category} className="rounded-lg border border-gray-200">
                          {/* Category Header — entire row toggles collapse */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleCollapse(category)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(category); } }}
                            className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              )}
                              <span className="text-sm font-semibold text-gray-900">
                                {category}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {grantedCount}/{defs.length}
                              </Badge>
                            </div>
                            {!role.is_super && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCategory(category, !allGranted);
                                }}
                                className={cn(
                                  'shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors cursor-pointer hover:opacity-80',
                                  allGranted ? 'bg-green-100 text-green-700'
                                    : allDenied ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-500'
                                )}
                              >
                                {allGranted ? 'All Granted' : allDenied ? 'All Denied' : 'Mixed'}
                              </button>
                            )}
                          </div>

                          {/* Permission Rows */}
                          {!isCollapsed && (
                            <div className="border-t border-gray-100">
                              {defs.map((def, idx) => {
                                const granted = role.is_super
                                  ? true
                                  : localPerms[def.key] === true;

                                return (
                                  <div
                                    key={def.key}
                                    className={cn(
                                      'flex items-center justify-between gap-3 px-4 py-1.5',
                                      idx % 2 === 1 && 'bg-gray-50/60'
                                    )}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="text-sm text-gray-700">
                                        {def.name}
                                      </span>
                                      {def.description && (
                                        <span className="ml-2 text-xs text-gray-400 hidden sm:inline">
                                          — {def.description}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={role.is_super}
                                      onClick={() => handleTogglePerm(def.key, !granted)}
                                      className={cn(
                                        'shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors',
                                        granted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                                        role.is_super ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                                      )}
                                    >
                                      {granted ? 'Granted' : 'Denied'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create Role Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogClose onClose={() => setShowCreate(false)} />
        <DialogHeader>
          <DialogTitle>Create Custom Role</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g., Shift Lead"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <Input
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Brief description of this role"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Copy permissions from
              </label>
              <Select
                value={copyFromRole}
                onChange={(e) => setCopyFromRole(e.target.value)}
              >
                <option value="">Start with no permissions</option>
                {roles.filter((r) => !r.is_super).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-gray-400">
                Pre-fill permissions from an existing role. You can adjust them after creation.
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreateRole} disabled={creating || !createName.trim()}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Create Role
              </>
            )}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Role Confirmation */}
      <ConfirmDialog
        open={!!deleteRole}
        onOpenChange={(open) => !open && setDeleteRole(null)}
        title="Delete Custom Role"
        description={
          deleteRole
            ? `Are you sure you want to delete the "${deleteRole.display_name}" role? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Role"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteRole}
      />

      {/* Reset to Defaults Confirmation */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={selectedRole?.is_system ? 'Reset to Defaults' : 'Reset to All Denied'}
        description={
          selectedRole?.is_system
            ? `Reset all permissions for "${selectedRole?.display_name}" to their original defaults? This will undo all manual changes.`
            : `Reset all permissions for "${selectedRole?.display_name}" to denied? This will remove all granted permissions.`
        }
        confirmLabel="Reset"
        variant="destructive"
        loading={resetting}
        onConfirm={handleResetDefaults}
      />
    </div>
  );
}
