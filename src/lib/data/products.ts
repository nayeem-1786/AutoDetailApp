import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import type {
  Product,
  ProductCategory,
} from '@/lib/supabase/types';

// Helper: create a Supabase client that works in both request and build contexts.
async function getClient() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

// ---------------------------------------------------------------------------
// Types for returned data shapes
// ---------------------------------------------------------------------------

export interface ProductWithCategory extends Product {
  product_categories: ProductCategory;
}

export interface ProductCategoryWithProducts {
  category: ProductCategory;
  products: ProductWithCategory[];
}

export interface ProductWithCategoryResult {
  product: ProductWithCategory;
  category: ProductCategory;
}

export interface SitemapProduct {
  productSlug: string;
  categorySlug: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// getProductCategories
// All active product categories ordered by display_order.
// ---------------------------------------------------------------------------

export async function getProductCategories(): Promise<ProductCategory[]> {
  const supabase = await getClient();

  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching product categories:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// getProductsByCategory
// All active products belonging to a category identified by slug.
// Returns the category and its products, or null if category not found.
// ---------------------------------------------------------------------------

export async function getProductsByCategory(
  categorySlug: string
): Promise<ProductCategoryWithProducts | null> {
  const supabase = await getClient();

  // 1. Look up the category by slug
  const { data: category, error: catError } = await supabase
    .from('product_categories')
    .select('*')
    .eq('slug', categorySlug)
    .eq('is_active', true)
    .single();

  if (catError || !category) {
    return null;
  }

  // 2. Fetch products for this category
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*, product_categories!inner(*)')
    .eq('category_id', category.id)
    .eq('is_active', true)
    .eq('show_on_website', true)
    .order('website_sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (prodError) {
    console.error('Error fetching products by category:', prodError.message);
    return { category, products: [] };
  }

  return {
    category,
    products: (products ?? []) as ProductWithCategory[],
  };
}

// ---------------------------------------------------------------------------
// getProductBySlug
// Fetch a single product by its slug, verifying it belongs to the category
// identified by categorySlug.
// ---------------------------------------------------------------------------

export async function getProductBySlug(
  categorySlug: string,
  productSlug: string
): Promise<ProductWithCategoryResult | null> {
  const supabase = await getClient();

  const { data: product, error } = await supabase
    .from('products')
    .select('*, product_categories!inner(*)')
    .eq('slug', productSlug)
    .eq('is_active', true)
    .eq('show_on_website', true)
    .eq('product_categories.slug', categorySlug)
    .eq('product_categories.is_active', true)
    .single();

  if (error || !product) {
    return null;
  }

  const typedProduct = product as ProductWithCategory;

  return {
    product: typedProduct,
    category: typedProduct.product_categories,
  };
}

// ---------------------------------------------------------------------------
// getAllProductsForSitemap
// Minimal data for generating the sitemap: product slug, category slug, and
// the last-updated timestamp.
// ---------------------------------------------------------------------------

export async function getAllProductsForSitemap(): Promise<SitemapProduct[]> {
  const supabase = await getClient();

  const { data, error } = await supabase
    .from('products')
    .select('slug, updated_at, product_categories!inner(slug)')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .eq('product_categories.is_active', true);

  if (error) {
    console.error('Error fetching products for sitemap:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    productSlug: row.slug as string,
    categorySlug: (row.product_categories as unknown as { slug: string }).slug,
    updatedAt: row.updated_at as string,
  }));
}
