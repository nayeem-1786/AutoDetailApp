'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ArrowLeft, ArrowRight, Plus, X, Info, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'basics' | 'targeting' | 'conditions' | 'rewards' | 'limits' | 'review';

const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'targeting', label: 'Who' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'limits', label: 'Limits' },
  { key: 'review', label: 'Review' },
];

type Targeting = 'everyone' | 'customer' | 'group';
type ConditionLogic = 'and' | 'or';
type TagMatchMode = 'any' | 'all';

interface RewardRow {
  id: string;
  appliesTo: 'order' | 'product' | 'service';
  targetProductId: string;
  targetServiceId: string;
  targetProductCategoryId: string;
  targetServiceCategoryId: string;
  targetMode: 'specific' | 'category' | '';
  discountType: 'percentage' | 'flat' | 'free';
  value: string;
  maxDiscount: string;
}

interface CustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

// ---------------------------------------------------------------------------
// Searchable Select
// ---------------------------------------------------------------------------

interface SearchableSelectItem {
  id: string;
  label: string;
  sublabel?: string;
}

function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = 'Search...',
  id,
}: {
  items: SearchableSelectItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = items.find((i) => i.id === value);
  const filtered = items.filter(
    (i) =>
      i.label.toLowerCase().includes(query.toLowerCase()) ||
      (i.sublabel && i.sublabel.toLowerCase().includes(query.toLowerCase()))
  );

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{selected.label}</p>
          {selected.sublabel && (
            <p className="truncate text-xs text-gray-500">{selected.sublabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); }}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.slice(0, 50).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onChange(item.id); setQuery(''); setOpen(false); }}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">{item.label}</span>
              {item.sublabel && (
                <span className="text-xs text-gray-500">{item.sublabel}</span>
              )}
            </button>
          ))}
          {filtered.length > 50 && (
            <p className="px-3 py-2 text-xs text-gray-400">
              {filtered.length - 50} more results — refine your search
            </p>
          )}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-gray-500">No results found</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi Searchable Select (select multiple items as chips)
// ---------------------------------------------------------------------------

function MultiSearchableSelect({
  items,
  values,
  onChange,
  placeholder = 'Search...',
}: {
  items: SearchableSelectItem[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedItems = values
    .map((v) => items.find((i) => i.id === v))
    .filter(Boolean) as SearchableSelectItem[];

  const available = items.filter(
    (i) =>
      !values.includes(i.id) &&
      (i.label.toLowerCase().includes(query.toLowerCase()) ||
        (i.sublabel && i.sublabel.toLowerCase().includes(query.toLowerCase())))
  );

  function addItem(id: string) {
    onChange([...values, id]);
    setQuery('');
  }

  function removeItem(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
            >
              {item.label}
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="rounded-full p-0.5 hover:bg-gray-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      {/* Dropdown */}
      {open && available.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {available.slice(0, 50).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { addItem(item.id); }}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">{item.label}</span>
              {item.sublabel && (
                <span className="text-xs text-gray-500">{item.sublabel}</span>
              )}
            </button>
          ))}
          {available.length > 50 && (
            <p className="px-3 py-2 text-xs text-gray-400">
              {available.length - 50} more results — refine your search
            </p>
          )}
        </div>
      )}
      {open && available.length === 0 && query && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-gray-500">No results found</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewCouponPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const supabase = createClient();

  // Step state
  const [step, setStep] = useState<Step>('basics');
  const [draftLoaded, setDraftLoaded] = useState(!editId); // true if no draft to load

  // Usage tracking (for warning when editing used coupons)
  const [useCount, setUseCount] = useState(0);
  const [showUsageWarning, setShowUsageWarning] = useState(false);

  // Reference data
  const [products, setProducts] = useState<{ id: string; name: string; sku: string | null; category_id: string | null; vendor: { name: string } | null }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string; category_id: string | null }[]>([]);
  const [productCategories, setProductCategories] = useState<{ id: string; name: string }[]>([]);
  const [serviceCategories, setServiceCategories] = useState<{ id: string; name: string }[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Step 1: Basics
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [autoApply, setAutoApply] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Step 2: Targeting
  const [targetCustomerType, setTargetCustomerType] = useState<string>('');
  const [targeting, setTargeting] = useState<Targeting>('everyone');
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [customerTags, setCustomerTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>('any');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Conditions
  const [hasConditions, setHasConditions] = useState(false);
  const [conditionLogic, setConditionLogic] = useState<ConditionLogic>('and');
  const [requiresProductIds, setRequiresProductIds] = useState<string[]>([]);
  const [requiresServiceIds, setRequiresServiceIds] = useState<string[]>([]);
  const [requiresProductCategoryIds, setRequiresProductCategoryIds] = useState<string[]>([]);
  const [requiresServiceCategoryIds, setRequiresServiceCategoryIds] = useState<string[]>([]);
  const [minPurchase, setMinPurchase] = useState('');
  const [maxCustomerVisits, setMaxCustomerVisits] = useState('');
  const [showProductCategory, setShowProductCategory] = useState(false);
  const [showServiceCategory, setShowServiceCategory] = useState(false);

  // Step 4: Rewards
  const [rewards, setRewards] = useState<RewardRow[]>([
    {
      id: crypto.randomUUID(),
      appliesTo: 'order',
      targetProductId: '',
      targetServiceId: '',
      targetProductCategoryId: '',
      targetServiceCategoryId: '',
      targetMode: '',
      discountType: 'percentage',
      value: '',
      maxDiscount: '',
    },
  ]);

  // Step 5: Limits
  const [expiresAt, setExpiresAt] = useState('');
  const [isSingleUse, setIsSingleUse] = useState(true);
  const [maxUses, setMaxUses] = useState('');

  // Draft auto-save state
  const [couponId, setCouponId] = useState<string | null>(null);

  // Submit state
  const [creating, setCreating] = useState(false);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      const [prodRes, svcRes, prodCatRes, svcCatRes, tagsRes] = await Promise.all([
        supabase.from('products').select('id, name, sku, category_id, vendor:vendors(name)').eq('is_active', true).order('name'),
        supabase.from('services').select('id, name, category_id').eq('is_active', true).order('name'),
        supabase.from('product_categories').select('id, name').eq('is_active', true).order('name'),
        supabase.from('service_categories').select('id, name').eq('is_active', true).order('name'),
        supabase.from('customers').select('tags'),
      ]);
      if (prodRes.data) setProducts(prodRes.data.map((p: any) => ({
        ...p,
        vendor: Array.isArray(p.vendor) ? p.vendor[0] ?? null : p.vendor ?? null,
      })));
      if (svcRes.data) setServices(svcRes.data);
      if (prodCatRes.data) setProductCategories(prodCatRes.data);
      if (svcCatRes.data) setServiceCategories(svcCatRes.data);

      // Extract unique tags from all customers
      if (tagsRes.data) {
        const tagSet = new Set<string>();
        for (const row of tagsRes.data) {
          if (Array.isArray(row.tags)) {
            for (const t of row.tags) {
              if (t) tagSet.add(t);
            }
          }
        }
        setAllTags(Array.from(tagSet).sort());
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing draft if ?edit=<id> is present
  useEffect(() => {
    if (!editId) return;
    async function loadDraft() {
      try {
        const res = await fetch(`/api/marketing/coupons/${editId}`);
        if (!res.ok) {
          toast.error('Draft not found');
          setDraftLoaded(true);
          return;
        }
        const { data: c } = await res.json();
        setCouponId(c.id);
        setUseCount(c.use_count || 0);
        setName(c.name || '');
        if (c.code) {
          setCode(c.code);
          setAutoGenerate(false);
        }
        setAutoApply(c.auto_apply || false);
        setTargetCustomerType(c.target_customer_type || '');

        // Targeting
        if (c.customer_id) {
          setTargeting('customer');
          setCustomerId(c.customer_id);
          // Try to load customer name
          const { data: cust } = await supabase
            .from('customers')
            .select('first_name, last_name')
            .eq('id', c.customer_id)
            .single();
          if (cust) setSelectedCustomer({ id: c.customer_id, name: `${cust.first_name} ${cust.last_name}` });
        } else if (c.customer_tags && c.customer_tags.length > 0) {
          setTargeting('group');
          setCustomerTags(c.customer_tags);
          setTagMatchMode(c.tag_match_mode || 'any');
        }

        // Conditions
        const hasCond = !!((c.requires_product_ids && c.requires_product_ids.length > 0) ||
          (c.requires_service_ids && c.requires_service_ids.length > 0) ||
          (c.requires_product_category_ids && c.requires_product_category_ids.length > 0) ||
          (c.requires_service_category_ids && c.requires_service_category_ids.length > 0) ||
          c.min_purchase ||
          c.max_customer_visits != null);
        setHasConditions(hasCond);
        setConditionLogic(c.condition_logic || 'and');
        setRequiresProductIds(c.requires_product_ids || []);
        setRequiresServiceIds(c.requires_service_ids || []);
        setRequiresProductCategoryIds(c.requires_product_category_ids || []);
        setRequiresServiceCategoryIds(c.requires_service_category_ids || []);
        if (c.requires_product_category_ids && c.requires_product_category_ids.length > 0) setShowProductCategory(true);
        if (c.requires_service_category_ids && c.requires_service_category_ids.length > 0) setShowServiceCategory(true);
        setMinPurchase(c.min_purchase != null ? String(c.min_purchase) : '');
        setMaxCustomerVisits(c.max_customer_visits != null ? String(c.max_customer_visits) : '');

        // Rewards
        const rw = c.coupon_rewards || [];
        if (rw.length > 0) {
          setRewards(rw.map((r: any) => ({
            id: r.id || crypto.randomUUID(),
            appliesTo: r.applies_to || 'order',
            targetProductId: r.target_product_id || '',
            targetServiceId: r.target_service_id || '',
            targetProductCategoryId: r.target_product_category_id || '',
            targetServiceCategoryId: r.target_service_category_id || '',
            targetMode: r.target_product_category_id || r.target_service_category_id ? 'category' :
              r.target_product_id || r.target_service_id ? 'specific' : '',
            discountType: r.discount_type || 'percentage',
            value: r.discount_type === 'free' ? '' : String(r.discount_value || ''),
            maxDiscount: r.max_discount != null ? String(r.max_discount) : '',
          })));
        }

        // Limits
        setExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : '');
        setIsSingleUse(c.is_single_use ?? true);
        setMaxUses(c.max_uses != null ? String(c.max_uses) : '');
      } catch {
        toast.error('Failed to load draft');
      }
      setDraftLoaded(true);
    }
    loadDraft();
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close tag dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setTagDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------------------
  // Searchable item lists
  // -------------------------------------------------------------------------

  // Build searchable items for products
  const productItems: SearchableSelectItem[] = products.map((p) => {
    const parts: string[] = [];
    if (p.sku) parts.push(`SKU: ${p.sku}`);
    const cat = productCategories.find((c) => c.id === p.category_id);
    if (cat) parts.push(cat.name);
    if (p.vendor?.name) parts.push(p.vendor.name);
    return {
      id: p.id,
      label: p.name,
      sublabel: parts.join(' | ') || undefined,
    };
  });

  // Build searchable items for services
  const serviceItems: SearchableSelectItem[] = services.map((s) => {
    const cat = serviceCategories.find((c) => c.id === s.category_id);
    return {
      id: s.id,
      label: s.name,
      sublabel: cat?.name || undefined,
    };
  });

  // Build searchable items for product categories
  const productCategoryItems: SearchableSelectItem[] = productCategories.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  // Build searchable items for service categories
  const serviceCategoryItems: SearchableSelectItem[] = serviceCategories.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  // -------------------------------------------------------------------------
  // Customer search (Step 2)
  // -------------------------------------------------------------------------

  async function searchCustomers(q: string) {
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const { data } = await res.json();
        setCustomerResults(data || []);
      }
    } catch {
      // Silently fail search
    }
  }

  function handleCustomerSearchChange(value: string) {
    setCustomerSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCustomers(value), 300);
  }

  function selectCustomer(c: CustomerResult) {
    setCustomerId(c.id);
    setSelectedCustomer({ id: c.id, name: `${c.first_name} ${c.last_name}` });
    setCustomerSearch('');
    setCustomerResults([]);
  }

  // -------------------------------------------------------------------------
  // Eligible customer count (Step 2)
  // -------------------------------------------------------------------------

  async function refreshEligibleCount() {
    setLoadingCount(true);
    try {
      if (targeting === 'everyone') {
        let query = supabase
          .from('customers')
          .select('*', { count: 'exact', head: true });
        if (targetCustomerType) {
          query = query.eq('customer_type', targetCustomerType);
        }
        const { count } = await query;
        setEligibleCount(count ?? 0);
      } else if (targeting === 'customer') {
        if (!selectedCustomer) {
          setEligibleCount(0);
        } else if (targetCustomerType) {
          // Check if selected customer matches the type filter
          const { data: cust } = await supabase
            .from('customers')
            .select('customer_type')
            .eq('id', customerId)
            .single();
          setEligibleCount(cust?.customer_type === targetCustomerType ? 1 : 0);
        } else {
          setEligibleCount(1);
        }
      } else if (targeting === 'group') {
        if (customerTags.length === 0) {
          setEligibleCount(0);
        } else {
          // Fetch customers that have tags, then filter in JS for any/all logic
          const { data } = await supabase
            .from('customers')
            .select('tags, customer_type');
          if (data) {
            const matched = data.filter((c: { tags: string[] | null; customer_type: string | null }) => {
              if (targetCustomerType && c.customer_type !== targetCustomerType) return false;
              const ct: string[] = Array.isArray(c.tags) ? c.tags : [];
              if (tagMatchMode === 'all') {
                return customerTags.every((t) => ct.includes(t));
              }
              return customerTags.some((t) => ct.includes(t));
            });
            setEligibleCount(matched.length);
          } else {
            setEligibleCount(0);
          }
        }
      }
    } catch {
      setEligibleCount(null);
    }
    setLoadingCount(false);
  }

  // Auto-refresh count when targeting config changes
  useEffect(() => {
    refreshEligibleCount();
  }, [targeting, selectedCustomer, customerTags, tagMatchMode, targetCustomerType]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Tag management (Step 2)
  // -------------------------------------------------------------------------

  // Filtered tags for dropdown (exclude already-selected, match search)
  const filteredTags = allTags.filter(
    (t) =>
      !customerTags.includes(t) &&
      t.toLowerCase().includes(tagInput.toLowerCase())
  );

  function addTag(value?: string) {
    const tag = (value ?? tagInput).trim();
    if (tag && !customerTags.includes(tag)) {
      setCustomerTags((prev) => [...prev, tag]);
    }
    setTagInput('');
    setTagDropdownOpen(false);
  }

  function removeTag(tag: string) {
    setCustomerTags((prev) => prev.filter((t) => t !== tag));
  }

  // -------------------------------------------------------------------------
  // Reward management (Step 4)
  // -------------------------------------------------------------------------

  function addReward() {
    setRewards((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        appliesTo: 'order',
        targetProductId: '',
        targetServiceId: '',
        targetProductCategoryId: '',
        targetServiceCategoryId: '',
        targetMode: '',
        discountType: 'percentage',
        value: '',
        maxDiscount: '',
      },
    ]);
  }

  function removeReward(id: string) {
    setRewards((prev) => prev.filter((r) => r.id !== id));
  }

  function updateReward(id: string, field: keyof RewardRow, value: string) {
    setRewards((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };

        // Reset dependent fields when appliesTo changes
        if (field === 'appliesTo') {
          updated.targetProductId = '';
          updated.targetServiceId = '';
          updated.targetProductCategoryId = '';
          updated.targetServiceCategoryId = '';
          if (value === 'order') {
            updated.targetMode = '';
          } else {
            updated.targetMode = 'specific';
          }
        }

        // When switching target mode, clear the opposing fields
        if (field === 'targetMode') {
          if (value === 'specific') {
            updated.targetProductCategoryId = '';
            updated.targetServiceCategoryId = '';
          } else if (value === 'category') {
            updated.targetProductId = '';
            updated.targetServiceId = '';
          }
        }

        // When discount type becomes free, clear value and max discount
        if (field === 'discountType' && value === 'free') {
          updated.value = '';
          updated.maxDiscount = '';
        }

        // Clear max discount if switching away from percentage
        if (field === 'discountType' && value !== 'percentage') {
          updated.maxDiscount = '';
        }

        return updated;
      })
    );
  }

  // -------------------------------------------------------------------------
  // Payload builder (shared by auto-save and final create)
  // -------------------------------------------------------------------------

  function buildPayload() {
    return {
      name: name.trim(),
      // Only include code when user specified a custom one.
      // When autoGenerate is true, omit code so POST auto-generates
      // and PATCH leaves the existing code untouched.
      ...(!autoGenerate ? { code: code.trim() } : {}),
      auto_apply: autoApply,
      target_customer_type: targetCustomerType || null,
      customer_id: targeting === 'customer' ? customerId : null,
      customer_tags: targeting === 'group' ? customerTags : null,
      tag_match_mode: tagMatchMode,
      condition_logic: conditionLogic,
      requires_product_ids: hasConditions && requiresProductIds.length > 0 ? requiresProductIds : null,
      requires_service_ids: hasConditions && requiresServiceIds.length > 0 ? requiresServiceIds : null,
      requires_product_category_ids: hasConditions && requiresProductCategoryIds.length > 0 ? requiresProductCategoryIds : null,
      requires_service_category_ids: hasConditions && requiresServiceCategoryIds.length > 0 ? requiresServiceCategoryIds : null,
      min_purchase: hasConditions && minPurchase ? parseFloat(minPurchase) : null,
      max_customer_visits: hasConditions && maxCustomerVisits !== '' ? parseInt(maxCustomerVisits) : null,
      is_single_use: isSingleUse,
      max_uses: maxUses ? parseInt(maxUses) : null,
      expires_at: expiresAt || null,
      rewards: rewards.map((r) => ({
        applies_to: r.appliesTo,
        discount_type: r.discountType,
        discount_value: r.discountType === 'free' ? 0 : parseFloat(r.value || '0'),
        max_discount: r.maxDiscount ? parseFloat(r.maxDiscount) : null,
        target_product_id: r.targetProductId || null,
        target_service_id: r.targetServiceId || null,
        target_product_category_id: r.targetProductCategoryId || null,
        target_service_category_id: r.targetServiceCategoryId || null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Silent auto-save (saves as draft on step navigation)
  // -------------------------------------------------------------------------

  async function silentSave() {
    if (!name.trim()) return; // Can't save without a name
    try {
      const payload = buildPayload();
      if (couponId) {
        await fetch(`/api/marketing/coupons/${couponId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Only try to create draft if we haven't already failed due to duplicate code
        if (codeError) return;

        const res = await fetch('/api/marketing/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'draft' }),
        });
        if (res.ok) {
          const result = await res.json();
          setCouponId(result.data.id);
        } else if (res.status === 409) {
          // Duplicate code - don't save, but don't show error (goNext will handle it)
          console.log('Draft save skipped: duplicate code');
        }
      }
    } catch {
      // Silent — don't interrupt the user for background saves
    }
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canNext = stepIndex < STEPS.length - 1;
  const canPrev = stepIndex > 0;

  async function goNext() {
    if (!canNext) return;

    // Validate basics step before proceeding
    if (step === 'basics') {
      if (!name.trim()) {
        toast.error('Enter a coupon name');
        return;
      }
      if (!autoGenerate && code.trim()) {
        // Check for duplicate code (only if not editing this coupon)
        const normalizedCode = code.toUpperCase().replace(/\s/g, '').trim();
        const res = await fetch(`/api/marketing/coupons?search=${encodeURIComponent(normalizedCode)}&limit=1`);
        if (res.ok) {
          const { data } = await res.json();
          const duplicate = data?.find((c: { code: string; id: string }) =>
            c.code.toUpperCase() === normalizedCode && c.id !== couponId
          );
          if (duplicate) {
            setCodeError(`Code "${normalizedCode}" is already in use`);
            toast.error(`Coupon code "${normalizedCode}" already exists`);
            return;
          }
        }
        setCodeError(null);
      }
    }

    await silentSave();
    setStep(STEPS[stepIndex + 1].key);
  }

  async function goPrev() {
    if (canPrev) {
      await silentSave();
      setStep(STEPS[stepIndex - 1].key);
    }
  }

  async function handleSaveAndExit() {
    if (!name.trim()) {
      toast.error('Enter a name before saving');
      return;
    }
    if (!autoGenerate && !code.trim()) {
      toast.error('Enter a coupon code or turn on auto-generate');
      return;
    }
    if (expiresAt && new Date(expiresAt) < new Date()) {
      toast.error('Expiration date is in the past — update it or clear it before saving');
      return;
    }
    try {
      const payload = buildPayload();
      if (couponId) {
        const res = await fetch(`/api/marketing/coupons/${couponId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const result = await res.json();
          toast.error(result.error || 'Failed to save coupon');
          return;
        }
      } else {
        const res = await fetch('/api/marketing/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'draft' }),
        });
        if (!res.ok) {
          const result = await res.json();
          toast.error(result.error || 'Failed to save coupon');
          return;
        }
        const result = await res.json();
        setCouponId(result.data.id);
      }
      toast.success('Coupon saved');
      router.push(editId ? `/admin/marketing/coupons/${editId}` : '/admin/marketing/coupons');
    } catch {
      toast.error('Failed to save coupon');
    }
  }

  // -------------------------------------------------------------------------
  // Submit (activate the coupon)
  // -------------------------------------------------------------------------

  async function handleCreate(forceUpdate = false) {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!autoGenerate && !code.trim()) {
      toast.error('Enter a coupon code or turn on auto-generate');
      return;
    }
    if (rewards.length === 0) {
      toast.error('At least one reward is required');
      return;
    }
    if (expiresAt && new Date(expiresAt) < new Date()) {
      toast.error('Expiration date is in the past — update it or clear it before saving');
      return;
    }

    // Warn if editing a coupon that has been used
    if (editId && useCount > 0 && !forceUpdate) {
      setShowUsageWarning(true);
      return;
    }

    setCreating(true);
    try {
      const payload = buildPayload();
      let resultData;

      if (couponId) {
        // Draft exists — update it and set status to active
        const res = await fetch(`/api/marketing/coupons/${couponId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'active' }),
        });
        const result = await res.json();
        if (!res.ok) {
          toast.error(result.error || 'Failed to create coupon');
          return;
        }
        resultData = result.data;
      } else {
        // No draft — create new as active
        const res = await fetch('/api/marketing/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) {
          toast.error(result.error || 'Failed to create coupon');
          return;
        }
        resultData = result.data;
      }

      toast.success(`Coupon ${resultData.code} ${editId ? 'updated' : 'created'}`);
      router.push(`/admin/marketing/coupons/${resultData.id}`);
    } catch {
      toast.error('Failed to create coupon');
    } finally {
      setCreating(false);
    }
  }

  // Create as new coupon (duplicate with new ID)
  async function handleCreateAsNew() {
    setShowUsageWarning(false);
    setCreating(true);
    try {
      const payload = buildPayload();
      // Force a new code if not auto-generating
      if (!autoGenerate) {
        payload.code = code + '-NEW';
      }
      const res = await fetch('/api/marketing/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Failed to create coupon');
        return;
      }
      toast.success(`New coupon ${result.data.code} created`);
      router.push(`/admin/marketing/coupons/${result.data.id}`);
    } catch {
      toast.error('Failed to create coupon');
    } finally {
      setCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Review helpers
  // -------------------------------------------------------------------------

  function describeTargeting(): string {
    let desc = '';
    if (targeting === 'everyone') desc = 'Everyone';
    else if (targeting === 'customer') {
      desc = selectedCustomer ? selectedCustomer.name : 'Specific customer (not selected)';
    } else if (targeting === 'group') {
      if (customerTags.length === 0) desc = 'Customer group (no tags set)';
      else desc = `Customers tagged [${customerTags.join(', ')}] (match ${tagMatchMode})`;
    } else {
      desc = 'Everyone';
    }
    if (targetCustomerType) {
      desc += ` (${targetCustomerType === 'enthusiast' ? 'Enthusiast' : 'Professional'} only)`;
    }
    return desc;
  }

  function describeConditions(): string {
    if (!hasConditions) return 'No conditions';
    const parts: string[] = [];

    if (requiresProductIds.length > 0) {
      const names = requiresProductIds.map((id) => {
        const p = products.find((x) => x.id === id);
        return p?.name || id;
      });
      if (names.length === 1) {
        parts.push(`requires product "${names[0]}"`);
      } else {
        parts.push(`requires any of products: ${names.join(', ')}`);
      }
    }
    if (requiresProductCategoryIds.length > 0) {
      const names = requiresProductCategoryIds.map((id) => {
        const c = productCategories.find((x) => x.id === id);
        return c?.name || id;
      });
      if (names.length === 1) {
        parts.push(`requires product category "${names[0]}"`);
      } else {
        parts.push(`requires any of product categories: ${names.join(', ')}`);
      }
    }
    if (requiresServiceIds.length > 0) {
      const names = requiresServiceIds.map((id) => {
        const s = services.find((x) => x.id === id);
        return s?.name || id;
      });
      if (names.length === 1) {
        parts.push(`requires service "${names[0]}"`);
      } else {
        parts.push(`requires any of services: ${names.join(', ')}`);
      }
    }
    if (requiresServiceCategoryIds.length > 0) {
      const names = requiresServiceCategoryIds.map((id) => {
        const c = serviceCategories.find((x) => x.id === id);
        return c?.name || id;
      });
      if (names.length === 1) {
        parts.push(`requires service category "${names[0]}"`);
      } else {
        parts.push(`requires any of service categories: ${names.join(', ')}`);
      }
    }
    if (minPurchase) {
      parts.push(`minimum purchase $${parseFloat(minPurchase).toFixed(2)}`);
    }
    if (maxCustomerVisits !== '') {
      const v = parseInt(maxCustomerVisits);
      parts.push(v === 0 ? 'new customers only' : `customers with ${v} or fewer visits`);
    }

    if (parts.length === 0) return 'Conditions enabled but none specified';
    const joiner = conditionLogic === 'and' ? ' AND ' : ' OR ';
    return parts.join(joiner);
  }

  function describeReward(r: RewardRow): string {
    let target = 'entire order';
    if (r.appliesTo === 'product') {
      if (r.targetMode === 'category') {
        const c = productCategories.find((x) => x.id === r.targetProductCategoryId);
        target = `product category "${c?.name || 'unselected'}"`;
      } else {
        const p = products.find((x) => x.id === r.targetProductId);
        target = `product "${p?.name || 'unselected'}"`;
      }
    } else if (r.appliesTo === 'service') {
      if (r.targetMode === 'category') {
        const c = serviceCategories.find((x) => x.id === r.targetServiceCategoryId);
        target = `service category "${c?.name || 'unselected'}"`;
      } else {
        const s = services.find((x) => x.id === r.targetServiceId);
        target = `service "${s?.name || 'unselected'}"`;
      }
    }

    if (r.discountType === 'free') return `Free -- ${target}`;
    if (r.discountType === 'percentage') {
      let desc = `${r.value || '0'}% off ${target}`;
      if (r.maxDiscount) desc += ` (max $${parseFloat(r.maxDiscount).toFixed(2)})`;
      return desc;
    }
    return `$${r.value || '0'} off ${target}`;
  }

  function describeLimits(): string {
    const parts: string[] = [];
    if (expiresAt) {
      const d = new Date(expiresAt);
      parts.push(`Expires ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } else {
      parts.push('No expiration');
    }
    parts.push(isSingleUse ? 'Single use per customer' : 'Unlimited uses per customer');
    if (maxUses) {
      parts.push(`${maxUses} total uses`);
    } else {
      parts.push('Unlimited total uses');
    }
    return parts.join(' / ');
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!draftLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={editId ? 'Edit Coupon' : 'Create Coupon'}
        action={
          <Button
            variant="outline"
            onClick={() => router.push('/admin/marketing/coupons')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-gray-300" />}
            <button
              onClick={async () => { await silentSave(); setStep(s.key); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                step === s.key
                  ? 'bg-gray-900 text-white'
                  : i < stepIndex
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>

      {/* ================================================================= */}
      {/* Step 1: Basics                                                    */}
      {/* ================================================================= */}
      {step === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle>Coupon Basics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Give your coupon a descriptive name and optionally set a custom code.
                If you enable auto-apply, the coupon will activate automatically at
                the POS when conditions are met.
              </span>
            </div>

            <div className="space-y-6">
              <FormField label="Name" required htmlFor="coupon-name">
                <Input
                  id="coupon-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Spring Booster Bundle"
                />
              </FormField>

              <div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="auto-generate"
                    checked={autoGenerate}
                    onChange={() => setAutoGenerate(!autoGenerate)}
                  />
                  <label
                    htmlFor="auto-generate"
                    className="text-sm font-medium text-gray-700"
                  >
                    Auto-generate coupon code
                  </label>
                </div>

                {!autoGenerate && (
                  <div className="mt-3">
                    <FormField label="Coupon Code" htmlFor="coupon-code" error={codeError || undefined}>
                      <Input
                        id="coupon-code"
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.toUpperCase().replace(/\s/g, ''));
                          setCodeError(null); // Clear error on change
                        }}
                        placeholder="e.g. SPRING25"
                        className={`font-mono uppercase ${codeError ? 'border-red-500' : ''}`}
                      />
                    </FormField>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="auto-apply"
                    checked={autoApply}
                    onChange={() => setAutoApply(!autoApply)}
                  />
                  <label
                    htmlFor="auto-apply"
                    className="text-sm font-medium text-gray-700"
                  >
                    Auto-apply at POS
                  </label>
                </div>
                <p className="mt-1 ml-7 text-xs text-gray-500">
                  When enabled, this coupon applies automatically at the POS when
                  conditions are met -- no code needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Step 2: Who Can Use This?                                         */}
      {/* ================================================================= */}
      {step === 'targeting' && (
        <Card>
          <CardHeader>
            <CardTitle>Who Can Use This?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Choose who can use this coupon.</span>
            </div>

            <div className="space-y-4">
              {/* Targeting options */}
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setTargeting('everyone')}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                    targeting === 'everyone'
                      ? 'border-gray-900 bg-gray-50 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Everyone
                  <p className="mt-0.5 text-xs font-normal text-gray-500">
                    Any customer can use this coupon
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => { setTargeting('customer'); setTargetCustomerType(''); }}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                    targeting === 'customer'
                      ? 'border-gray-900 bg-gray-50 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Specific Customer
                  <p className="mt-0.5 text-xs font-normal text-gray-500">
                    Assign to one customer
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTargeting('group')}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                    targeting === 'group'
                      ? 'border-gray-900 bg-gray-50 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Customer Group
                  <p className="mt-0.5 text-xs font-normal text-gray-500">
                    Filter by customer tags
                  </p>
                </button>
              </div>

              {/* Customer Type restriction */}
              <div className={`mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4${targeting === 'customer' ? ' opacity-50 pointer-events-none' : ''}`}>
                <p className="mb-2 text-sm font-medium text-gray-700">Customer Type</p>
                {targeting === 'customer' && (
                  <p className="mb-2 text-xs text-gray-500">(Not applicable for specific customer)</p>
                )}
                <div className="flex gap-2">
                  {[
                    { value: '', label: 'Any Type' },
                    { value: 'enthusiast', label: 'Enthusiast Only' },
                    { value: 'professional', label: 'Professional Only' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTargetCustomerType(opt.value)}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                        targetCustomerType === opt.value
                          ? 'bg-gray-900 text-white'
                          : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {targetCustomerType && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Only customers marked as &ldquo;{targetCustomerType === 'enthusiast' ? 'Enthusiast' : 'Professional'}&rdquo; can use this coupon
                    (enforcement depends on the Coupon Enforcement setting in Settings).
                  </p>
                )}
              </div>

              {/* Specific customer picker */}
              {targeting === 'customer' && (
                <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedCustomer.name}
                        </p>
                        <p className="text-xs text-gray-500">Selected customer</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustomerId('');
                        }}
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <FormField label="Search Customers" htmlFor="customer-search">
                        <Input
                          id="customer-search"
                          value={customerSearch}
                          onChange={(e) => handleCustomerSearchChange(e.target.value)}
                          placeholder="Type a name or phone number..."
                        />
                      </FormField>

                      {customerResults.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
                          {customerResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCustomer(c)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                            >
                              <span className="font-medium text-gray-900">
                                {c.first_name} {c.last_name}
                              </span>
                              {c.phone && (
                                <span className="text-xs text-gray-500">{c.phone}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Customer group */}
              {targeting === 'group' && (
                <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {/* Tag input with searchable dropdown */}
                  <div>
                    <FormField label="Tags" htmlFor="tag-input">
                      <div className="relative">
                        <div className="flex gap-2">
                          <Input
                            ref={tagInputRef}
                            id="tag-input"
                            value={tagInput}
                            onChange={(e) => {
                              setTagInput(e.target.value);
                              setTagDropdownOpen(true);
                            }}
                            onFocus={() => setTagDropdownOpen(true)}
                            placeholder="Search or type a new tag..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTag();
                              }
                              if (e.key === 'Escape') {
                                setTagDropdownOpen(false);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => addTag()}
                            disabled={!tagInput.trim()}
                          >
                            Add
                          </Button>
                        </div>

                        {/* Dropdown */}
                        {tagDropdownOpen && (filteredTags.length > 0 || (tagInput.trim() && !allTags.includes(tagInput.trim()))) && (
                          <div
                            ref={tagDropdownRef}
                            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
                          >
                            {filteredTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => addTag(tag)}
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {tag}
                              </button>
                            ))}
                            {tagInput.trim() && !allTags.includes(tagInput.trim()) && !customerTags.includes(tagInput.trim()) && (
                              <button
                                type="button"
                                onClick={() => addTag()}
                                className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                              >
                                <Plus className="h-3 w-3" />
                                Create &ldquo;{tagInput.trim()}&rdquo;
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </FormField>

                    {customerTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {customerTags.map((tag) => (
                          <Badge key={tag} variant="default" className="gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-0.5 rounded-full hover:bg-gray-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Match mode */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <p className="text-xs font-medium text-gray-600">Match Mode</p>
                      <div className="group relative">
                        <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          <p className="font-medium">Match Any (OR)</p>
                          <p className="mt-0.5 text-gray-300">Customer needs at least one of the selected tags.</p>
                          <p className="mt-1.5 font-medium">Match All (AND)</p>
                          <p className="mt-0.5 text-gray-300">Customer must have every selected tag.</p>
                          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTagMatchMode('any')}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          tagMatchMode === 'any'
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Match Any
                      </button>
                      <button
                        type="button"
                        onClick={() => setTagMatchMode('all')}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          tagMatchMode === 'all'
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Match All
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Eligible customer count */}
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Eligible Customers</p>
                <p className="text-xs text-gray-500">
                  {targeting === 'everyone'
                    ? 'All customers in your database'
                    : targeting === 'customer'
                      ? 'Single assigned customer'
                      : customerTags.length === 0
                        ? 'Add tags to see matching customers'
                        : `Customers matching ${tagMatchMode === 'all' ? 'all' : 'any'} of your selected tags`}
                </p>
              </div>
              <div className="text-right">
                {loadingCount ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                ) : eligibleCount !== null ? (
                  <Badge variant={eligibleCount > 0 ? 'success' : 'warning'} className="text-base">
                    {eligibleCount.toLocaleString()}
                  </Badge>
                ) : (
                  <span className="text-sm text-gray-400">--</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Step 3: Conditions (IF)                                           */}
      {/* ================================================================= */}
      {step === 'conditions' && (
        <Card>
          <CardHeader>
            <CardTitle>Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Set conditions that must be met before this coupon can be used.
              </span>
            </div>

            <div className="space-y-6">
              {/* Toggle */}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="has-conditions"
                  checked={!hasConditions}
                  onChange={() => setHasConditions(!hasConditions)}
                />
                <label
                  htmlFor="has-conditions"
                  className="text-sm font-medium text-gray-700"
                >
                  No conditions -- works on any order
                </label>
              </div>

              {hasConditions && (
                <div className="space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {/* Logic mode */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-700">
                        Condition Logic
                      </p>
                      <div className="group relative">
                        <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-64 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          <p className="font-medium">ALL (AND)</p>
                          <p className="mt-0.5 text-gray-300">Every condition below must be satisfied for the coupon to apply.</p>
                          <p className="mt-1.5 font-medium">ANY (OR)</p>
                          <p className="mt-0.5 text-gray-300">Meeting any single condition is enough for the coupon to apply.</p>
                          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConditionLogic('and')}
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                          conditionLogic === 'and'
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        ALL conditions must be met (AND)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConditionLogic('or')}
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                          conditionLogic === 'or'
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        ANY condition suffices (OR)
                      </button>
                    </div>
                  </div>

                  {/* Requires product(s) or product category(ies) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">
                        {showProductCategory ? 'Requires Product Category(ies)' : 'Requires Product(s)'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowProductCategory(!showProductCategory);
                          if (!showProductCategory) {
                            setRequiresProductIds([]);
                          } else {
                            setRequiresProductCategoryIds([]);
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showProductCategory
                          ? 'or choose specific products'
                          : 'or choose by category'}
                      </button>
                    </div>
                    {!showProductCategory ? (
                      <div className="mt-1">
                        <MultiSearchableSelect
                          items={productItems}
                          values={requiresProductIds}
                          onChange={setRequiresProductIds}
                          placeholder="Search by name, SKU, vendor..."
                        />
                        {requiresProductIds.length > 1 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Cart must contain ANY one of these products
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1">
                        <MultiSearchableSelect
                          items={productCategoryItems}
                          values={requiresProductCategoryIds}
                          onChange={setRequiresProductCategoryIds}
                          placeholder="Search product categories..."
                        />
                        {requiresProductCategoryIds.length > 1 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Cart must contain a product from ANY one of these categories
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Requires service(s) or service category(ies) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">
                        {showServiceCategory ? 'Requires Service Category(ies)' : 'Requires Service(s)'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowServiceCategory(!showServiceCategory);
                          if (!showServiceCategory) {
                            setRequiresServiceIds([]);
                          } else {
                            setRequiresServiceCategoryIds([]);
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showServiceCategory
                          ? 'or choose specific services'
                          : 'or choose by category'}
                      </button>
                    </div>
                    {!showServiceCategory ? (
                      <div className="mt-1">
                        <MultiSearchableSelect
                          items={serviceItems}
                          values={requiresServiceIds}
                          onChange={setRequiresServiceIds}
                          placeholder="Search by name, category..."
                        />
                        {requiresServiceIds.length > 1 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Cart must contain ANY one of these services
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1">
                        <MultiSearchableSelect
                          items={serviceCategoryItems}
                          values={requiresServiceCategoryIds}
                          onChange={setRequiresServiceCategoryIds}
                          placeholder="Search service categories..."
                        />
                        {requiresServiceCategoryIds.length > 1 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Cart must contain a service from ANY one of these categories
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Minimum purchase */}
                  <FormField label="Minimum Purchase Amount" htmlFor="min-purchase">
                    <Input
                      id="min-purchase"
                      type="number"
                      step="0.01"
                      min="0"
                      value={minPurchase}
                      onChange={(e) => setMinPurchase(e.target.value)}
                      placeholder="No minimum"
                    />
                  </FormField>

                  {/* Maximum customer visits */}
                  <FormField
                    label="Maximum Customer Visits"
                    htmlFor="max-visits"
                    description="Limit to customers with this many visits or fewer. Set to 0 for new customers only. Leave it empty to include all customers."
                  >
                    <Input
                      id="max-visits"
                      type="number"
                      step="1"
                      min="0"
                      value={maxCustomerVisits}
                      onChange={(e) => setMaxCustomerVisits(e.target.value)}
                      placeholder="No limit"
                    />
                  </FormField>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Step 4: Rewards (THEN)                                            */}
      {/* ================================================================= */}
      {step === 'rewards' && (
        <Card>
          <CardHeader>
            <CardTitle>Rewards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Define what discount the customer receives. You can add multiple
                rewards to a single coupon.
              </span>
            </div>

            <div className="space-y-4">
              {rewards.map((reward, idx) => (
                <div
                  key={reward.id}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">
                      Reward {idx + 1}
                    </p>
                    {rewards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReward(reward.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Applies to */}
                    <FormField label="Applies To" htmlFor={`applies-to-${reward.id}`}>
                      <Select
                        id={`applies-to-${reward.id}`}
                        value={reward.appliesTo}
                        onChange={(e) =>
                          updateReward(reward.id, 'appliesTo', e.target.value)
                        }
                      >
                        <option value="order">Entire Order</option>
                        <option value="product">Specific Product</option>
                        <option value="service">Specific Service</option>
                      </Select>
                    </FormField>

                    {/* Target picker -- product */}
                    {reward.appliesTo === 'product' && (
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="mb-1.5 text-sm font-medium text-gray-700">
                            {reward.targetMode === 'category'
                              ? 'Product Category'
                              : 'Target Product'}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              updateReward(
                                reward.id,
                                'targetMode',
                                reward.targetMode === 'category' ? 'specific' : 'category'
                              )
                            }
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {reward.targetMode === 'category'
                              ? 'choose specific product'
                              : 'choose a category'}
                          </button>
                        </div>
                        {reward.targetMode === 'category' ? (
                          <Select
                            value={reward.targetProductCategoryId}
                            onChange={(e) =>
                              updateReward(
                                reward.id,
                                'targetProductCategoryId',
                                e.target.value
                              )
                            }
                          >
                            <option value="">Select category...</option>
                            {productCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <SearchableSelect
                            items={productItems}
                            value={reward.targetProductId}
                            onChange={(val) => updateReward(reward.id, 'targetProductId', val)}
                            placeholder="Search products..."
                          />
                        )}
                      </div>
                    )}

                    {/* Target picker -- service */}
                    {reward.appliesTo === 'service' && (
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="mb-1.5 text-sm font-medium text-gray-700">
                            {reward.targetMode === 'category'
                              ? 'Service Category'
                              : 'Target Service'}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              updateReward(
                                reward.id,
                                'targetMode',
                                reward.targetMode === 'category' ? 'specific' : 'category'
                              )
                            }
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {reward.targetMode === 'category'
                              ? 'choose specific service'
                              : 'choose a category'}
                          </button>
                        </div>
                        {reward.targetMode === 'category' ? (
                          <Select
                            value={reward.targetServiceCategoryId}
                            onChange={(e) =>
                              updateReward(
                                reward.id,
                                'targetServiceCategoryId',
                                e.target.value
                              )
                            }
                          >
                            <option value="">Select category...</option>
                            {serviceCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <SearchableSelect
                            items={serviceItems}
                            value={reward.targetServiceId}
                            onChange={(val) => updateReward(reward.id, 'targetServiceId', val)}
                            placeholder="Search services..."
                          />
                        )}
                      </div>
                    )}

                    {/* Discount type */}
                    <FormField
                      label="Discount Type"
                      htmlFor={`discount-type-${reward.id}`}
                    >
                      <Select
                        id={`discount-type-${reward.id}`}
                        value={reward.discountType}
                        onChange={(e) =>
                          updateReward(reward.id, 'discountType', e.target.value)
                        }
                      >
                        <option value="percentage">Percentage Off</option>
                        <option value="flat">Dollar Amount Off</option>
                        <option value="free">Free</option>
                      </Select>
                    </FormField>

                    {/* Value */}
                    {reward.discountType !== 'free' && (
                      <FormField
                        label={
                          reward.discountType === 'percentage'
                            ? 'Percentage (%)'
                            : 'Amount ($)'
                        }
                        htmlFor={`value-${reward.id}`}
                      >
                        <Input
                          id={`value-${reward.id}`}
                          type="number"
                          step={reward.discountType === 'percentage' ? '1' : '0.01'}
                          min="0"
                          max={reward.discountType === 'percentage' ? '100' : undefined}
                          value={reward.value}
                          onChange={(e) =>
                            updateReward(reward.id, 'value', e.target.value)
                          }
                          placeholder={
                            reward.discountType === 'percentage'
                              ? 'e.g. 20'
                              : 'e.g. 10.00'
                          }
                        />
                      </FormField>
                    )}

                    {/* Max discount (percentage only) */}
                    {reward.discountType === 'percentage' && (
                      <FormField
                        label="Max Discount ($)"
                        htmlFor={`max-discount-${reward.id}`}
                        description="Cap the discount amount"
                      >
                        <Input
                          id={`max-discount-${reward.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={reward.maxDiscount}
                          onChange={(e) =>
                            updateReward(reward.id, 'maxDiscount', e.target.value)
                          }
                          placeholder="No cap"
                        />
                      </FormField>
                    )}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addReward}>
                <Plus className="h-4 w-4" />
                Add Reward
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Step 5: Limits                                                    */}
      {/* ================================================================= */}
      {step === 'limits' && (
        <Card>
          <CardHeader>
            <CardTitle>Limits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Control how many times and for how long this coupon can be used.
              </span>
            </div>

            <div className="space-y-6">
              <FormField label="Expiration Date" htmlFor="expires-at">
                <Input
                  id="expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </FormField>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="single-use"
                  checked={isSingleUse}
                  onChange={() => setIsSingleUse(!isSingleUse)}
                />
                <label
                  htmlFor="single-use"
                  className="text-sm font-medium text-gray-700"
                >
                  Single use per customer
                </label>
              </div>

              <FormField
                label="Maximum Total Uses"
                htmlFor="max-uses"
                description="Leave empty for unlimited uses"
              >
                <Input
                  id="max-uses"
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                />
              </FormField>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Step 6: Review                                                    */}
      {/* ================================================================= */}
      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review Coupon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Review the coupon details below before creating. You can click any
                step above to go back and make changes.
              </span>
            </div>

            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
              {/* Header */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {name || '(Untitled Coupon)'}
                </h3>
                <p className="text-sm text-gray-600">
                  Code:{' '}
                  {autoGenerate ? (
                    <span className="italic text-gray-400">Auto-generated</span>
                  ) : (
                    <span className="font-mono font-medium">
                      {code || '(empty)'}
                    </span>
                  )}
                  {' -- '}
                  {autoApply ? (
                    <span className="text-green-700">auto-apply</span>
                  ) : (
                    <span className="text-gray-500">must enter at POS</span>
                  )}
                </p>
              </div>

              <div className="h-px bg-gray-200" />

              {/* WHO */}
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Who</p>
                <p className="mt-0.5 text-sm text-gray-800">{describeTargeting()}</p>
              </div>

              {/* IF */}
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">If</p>
                <p className="mt-0.5 text-sm text-gray-800">{describeConditions()}</p>
              </div>

              {/* THEN */}
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Then</p>
                <div className="mt-0.5 space-y-1">
                  {rewards.length === 0 ? (
                    <p className="text-sm text-red-600">No rewards defined</p>
                  ) : (
                    rewards.map((r, idx) => (
                      <p key={r.id} className="text-sm text-gray-800">
                        {rewards.length > 1 && `${idx + 1}. `}
                        {describeReward(r)}
                      </p>
                    ))
                  )}
                </div>
              </div>

              {/* LIMITS */}
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Limits</p>
                <p className="mt-0.5 text-sm text-gray-800">{describeLimits()}</p>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Navigation                                                        */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={!canPrev}>
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSaveAndExit}
          >
            Save &amp; Exit
          </Button>
          {canNext ? (
            <Button onClick={goNext}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => handleCreate()} disabled={creating}>
              {creating
                ? (editId ? 'Updating...' : 'Creating...')
                : (editId ? 'Update Coupon' : 'Create Coupon')}
            </Button>
          )}
        </div>
      </div>

      {/* Usage Warning Dialog */}
      {showUsageWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowUsageWarning(false)} />
          <div className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Coupon Has Been Used</h3>
                <p className="mt-2 text-sm text-gray-600">
                  This coupon has been used <strong>{useCount} time{useCount !== 1 ? 's' : ''}</strong> in transactions.
                  Editing it will affect:
                </p>
                <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                  <li>Single-use checks (customers who used it can&apos;t use it again)</li>
                  <li>Usage analytics may become misleading</li>
                  <li>Historical transaction records reference this coupon</li>
                </ul>
                <p className="mt-3 text-sm font-medium text-gray-700">
                  We recommend creating a new coupon instead.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setShowUsageWarning(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowUsageWarning(false); handleCreate(true); }}
                className="w-full sm:w-auto"
              >
                Update Anyway
              </Button>
              <Button
                onClick={handleCreateAsNew}
                className="w-full sm:w-auto"
              >
                Create as New Coupon
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
