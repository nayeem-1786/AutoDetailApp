import { Package, Wrench, DollarSign, Users, Tag, Percent } from 'lucide-react';
import type { FavoriteColor } from '@/app/pos/types';

// Explicit Tailwind class map — 12 colors x 6 shades with dark: variants for JIT detection
export const TILE_COLORS: Record<string, { bg: string; text: string; hover: string }> = {
  // ─── Red ──────────────────────────────────────────────────────
  'red-10':  { bg: 'bg-red-100 dark:bg-red-900/40',  text: 'text-red-900 dark:text-red-300',  hover: 'hover:bg-red-200 dark:hover:bg-red-900/50' },
  'red-25':  { bg: 'bg-red-200 dark:bg-red-900/50',  text: 'text-red-900 dark:text-red-300',  hover: 'hover:bg-red-300 dark:hover:bg-red-800/50' },
  'red-40':  { bg: 'bg-red-300 dark:bg-red-800/50',  text: 'text-red-900 dark:text-red-300',  hover: 'hover:bg-red-400 dark:hover:bg-red-500' },
  'red-60':  { bg: 'bg-red-400 dark:bg-red-500',     text: 'text-white',                      hover: 'hover:bg-red-500 dark:hover:bg-red-600' },
  'red-80':  { bg: 'bg-red-500 dark:bg-red-600',     text: 'text-white',                      hover: 'hover:bg-red-600 dark:hover:bg-red-500' },
  'red-100': { bg: 'bg-red-600 dark:bg-red-500',     text: 'text-white',                      hover: 'hover:bg-red-700 dark:hover:bg-red-600' },

  // ─── Orange ───────────────────────────────────────────────────
  'orange-10':  { bg: 'bg-orange-100 dark:bg-orange-900/40',  text: 'text-orange-900 dark:text-orange-300',  hover: 'hover:bg-orange-200 dark:hover:bg-orange-900/50' },
  'orange-25':  { bg: 'bg-orange-200 dark:bg-orange-900/50',  text: 'text-orange-900 dark:text-orange-300',  hover: 'hover:bg-orange-300 dark:hover:bg-orange-800/50' },
  'orange-40':  { bg: 'bg-orange-300 dark:bg-orange-800/50',  text: 'text-orange-900 dark:text-orange-300',  hover: 'hover:bg-orange-400 dark:hover:bg-orange-500' },
  'orange-60':  { bg: 'bg-orange-400 dark:bg-orange-500',     text: 'text-white',                            hover: 'hover:bg-orange-500 dark:hover:bg-orange-600' },
  'orange-80':  { bg: 'bg-orange-500 dark:bg-orange-600',     text: 'text-white',                            hover: 'hover:bg-orange-600 dark:hover:bg-orange-500' },
  'orange-100': { bg: 'bg-orange-600 dark:bg-orange-500',     text: 'text-white',                            hover: 'hover:bg-orange-700 dark:hover:bg-orange-600' },

  // ─── Fuchsia ──────────────────────────────────────────────────
  'fuchsia-10':  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40',  text: 'text-fuchsia-900 dark:text-fuchsia-300',  hover: 'hover:bg-fuchsia-200 dark:hover:bg-fuchsia-900/50' },
  'fuchsia-25':  { bg: 'bg-fuchsia-200 dark:bg-fuchsia-900/50',  text: 'text-fuchsia-900 dark:text-fuchsia-300',  hover: 'hover:bg-fuchsia-300 dark:hover:bg-fuchsia-800/50' },
  'fuchsia-40':  { bg: 'bg-fuchsia-300 dark:bg-fuchsia-800/50',  text: 'text-fuchsia-900 dark:text-fuchsia-300',  hover: 'hover:bg-fuchsia-400 dark:hover:bg-fuchsia-500' },
  'fuchsia-60':  { bg: 'bg-fuchsia-400 dark:bg-fuchsia-500',     text: 'text-white',                              hover: 'hover:bg-fuchsia-500 dark:hover:bg-fuchsia-600' },
  'fuchsia-80':  { bg: 'bg-fuchsia-500 dark:bg-fuchsia-600',     text: 'text-white',                              hover: 'hover:bg-fuchsia-600 dark:hover:bg-fuchsia-500' },
  'fuchsia-100': { bg: 'bg-fuchsia-600 dark:bg-fuchsia-500',     text: 'text-white',                              hover: 'hover:bg-fuchsia-700 dark:hover:bg-fuchsia-600' },

  // ─── Lime ─────────────────────────────────────────────────────
  'lime-10':  { bg: 'bg-lime-100 dark:bg-lime-900/40',  text: 'text-lime-900 dark:text-lime-300',  hover: 'hover:bg-lime-200 dark:hover:bg-lime-900/50' },
  'lime-25':  { bg: 'bg-lime-200 dark:bg-lime-900/50',  text: 'text-lime-900 dark:text-lime-300',  hover: 'hover:bg-lime-300 dark:hover:bg-lime-800/50' },
  'lime-40':  { bg: 'bg-lime-300 dark:bg-lime-800/50',  text: 'text-lime-900 dark:text-lime-300',  hover: 'hover:bg-lime-400 dark:hover:bg-lime-500' },
  'lime-60':  { bg: 'bg-lime-400 dark:bg-lime-500',     text: 'text-white',                        hover: 'hover:bg-lime-500 dark:hover:bg-lime-600' },
  'lime-80':  { bg: 'bg-lime-500 dark:bg-lime-600',     text: 'text-white',                        hover: 'hover:bg-lime-600 dark:hover:bg-lime-500' },
  'lime-100': { bg: 'bg-lime-600 dark:bg-lime-500',     text: 'text-white',                        hover: 'hover:bg-lime-700 dark:hover:bg-lime-600' },

  // ─── Cyan ─────────────────────────────────────────────────────
  'cyan-10':  { bg: 'bg-cyan-100 dark:bg-cyan-900/40',  text: 'text-cyan-900 dark:text-cyan-300',  hover: 'hover:bg-cyan-200 dark:hover:bg-cyan-900/50' },
  'cyan-25':  { bg: 'bg-cyan-200 dark:bg-cyan-900/50',  text: 'text-cyan-900 dark:text-cyan-300',  hover: 'hover:bg-cyan-300 dark:hover:bg-cyan-800/50' },
  'cyan-40':  { bg: 'bg-cyan-300 dark:bg-cyan-800/50',  text: 'text-cyan-900 dark:text-cyan-300',  hover: 'hover:bg-cyan-400 dark:hover:bg-cyan-500' },
  'cyan-60':  { bg: 'bg-cyan-400 dark:bg-cyan-500',     text: 'text-white',                        hover: 'hover:bg-cyan-500 dark:hover:bg-cyan-600' },
  'cyan-80':  { bg: 'bg-cyan-500 dark:bg-cyan-600',     text: 'text-white',                        hover: 'hover:bg-cyan-600 dark:hover:bg-cyan-500' },
  'cyan-100': { bg: 'bg-cyan-600 dark:bg-cyan-500',     text: 'text-white',                        hover: 'hover:bg-cyan-700 dark:hover:bg-cyan-600' },

  // ─── Rose ─────────────────────────────────────────────────────
  'rose-10':  { bg: 'bg-rose-100 dark:bg-rose-900/40',  text: 'text-rose-900 dark:text-rose-300',  hover: 'hover:bg-rose-200 dark:hover:bg-rose-900/50' },
  'rose-25':  { bg: 'bg-rose-200 dark:bg-rose-900/50',  text: 'text-rose-900 dark:text-rose-300',  hover: 'hover:bg-rose-300 dark:hover:bg-rose-800/50' },
  'rose-40':  { bg: 'bg-rose-300 dark:bg-rose-800/50',  text: 'text-rose-900 dark:text-rose-300',  hover: 'hover:bg-rose-400 dark:hover:bg-rose-500' },
  'rose-60':  { bg: 'bg-rose-400 dark:bg-rose-500',     text: 'text-white',                        hover: 'hover:bg-rose-500 dark:hover:bg-rose-600' },
  'rose-80':  { bg: 'bg-rose-500 dark:bg-rose-600',     text: 'text-white',                        hover: 'hover:bg-rose-600 dark:hover:bg-rose-500' },
  'rose-100': { bg: 'bg-rose-600 dark:bg-rose-500',     text: 'text-white',                        hover: 'hover:bg-rose-700 dark:hover:bg-rose-600' },

  // ─── Teal ─────────────────────────────────────────────────────
  'teal-10':  { bg: 'bg-teal-100 dark:bg-teal-900/40',  text: 'text-teal-900 dark:text-teal-300',  hover: 'hover:bg-teal-200 dark:hover:bg-teal-900/50' },
  'teal-25':  { bg: 'bg-teal-200 dark:bg-teal-900/50',  text: 'text-teal-900 dark:text-teal-300',  hover: 'hover:bg-teal-300 dark:hover:bg-teal-800/50' },
  'teal-40':  { bg: 'bg-teal-300 dark:bg-teal-800/50',  text: 'text-teal-900 dark:text-teal-300',  hover: 'hover:bg-teal-400 dark:hover:bg-teal-500' },
  'teal-60':  { bg: 'bg-teal-400 dark:bg-teal-500',     text: 'text-white',                        hover: 'hover:bg-teal-500 dark:hover:bg-teal-600' },
  'teal-80':  { bg: 'bg-teal-500 dark:bg-teal-600',     text: 'text-white',                        hover: 'hover:bg-teal-600 dark:hover:bg-teal-500' },
  'teal-100': { bg: 'bg-teal-600 dark:bg-teal-500',     text: 'text-white',                        hover: 'hover:bg-teal-700 dark:hover:bg-teal-600' },

  // ─── Blue ─────────────────────────────────────────────────────
  'blue-10':  { bg: 'bg-blue-100 dark:bg-blue-900/40',  text: 'text-blue-900 dark:text-blue-300',  hover: 'hover:bg-blue-200 dark:hover:bg-blue-900/50' },
  'blue-25':  { bg: 'bg-blue-200 dark:bg-blue-900/50',  text: 'text-blue-900 dark:text-blue-300',  hover: 'hover:bg-blue-300 dark:hover:bg-blue-800/50' },
  'blue-40':  { bg: 'bg-blue-300 dark:bg-blue-800/50',  text: 'text-blue-900 dark:text-blue-300',  hover: 'hover:bg-blue-400 dark:hover:bg-blue-500' },
  'blue-60':  { bg: 'bg-blue-400 dark:bg-blue-500',     text: 'text-white',                        hover: 'hover:bg-blue-500 dark:hover:bg-blue-600' },
  'blue-80':  { bg: 'bg-blue-500 dark:bg-blue-600',     text: 'text-white',                        hover: 'hover:bg-blue-600 dark:hover:bg-blue-500' },
  'blue-100': { bg: 'bg-blue-600 dark:bg-blue-500',     text: 'text-white',                        hover: 'hover:bg-blue-700 dark:hover:bg-blue-600' },

  // ─── Indigo ───────────────────────────────────────────────────
  'indigo-10':  { bg: 'bg-indigo-100 dark:bg-indigo-900/40',  text: 'text-indigo-900 dark:text-indigo-300',  hover: 'hover:bg-indigo-200 dark:hover:bg-indigo-900/50' },
  'indigo-25':  { bg: 'bg-indigo-200 dark:bg-indigo-900/50',  text: 'text-indigo-900 dark:text-indigo-300',  hover: 'hover:bg-indigo-300 dark:hover:bg-indigo-800/50' },
  'indigo-40':  { bg: 'bg-indigo-300 dark:bg-indigo-800/50',  text: 'text-indigo-900 dark:text-indigo-300',  hover: 'hover:bg-indigo-400 dark:hover:bg-indigo-500' },
  'indigo-60':  { bg: 'bg-indigo-400 dark:bg-indigo-500',     text: 'text-white',                            hover: 'hover:bg-indigo-500 dark:hover:bg-indigo-600' },
  'indigo-80':  { bg: 'bg-indigo-500 dark:bg-indigo-600',     text: 'text-white',                            hover: 'hover:bg-indigo-600 dark:hover:bg-indigo-500' },
  'indigo-100': { bg: 'bg-indigo-600 dark:bg-indigo-500',     text: 'text-white',                            hover: 'hover:bg-indigo-700 dark:hover:bg-indigo-600' },

  // ─── Purple ───────────────────────────────────────────────────
  'purple-10':  { bg: 'bg-purple-100 dark:bg-purple-900/40',  text: 'text-purple-900 dark:text-purple-300',  hover: 'hover:bg-purple-200 dark:hover:bg-purple-900/50' },
  'purple-25':  { bg: 'bg-purple-200 dark:bg-purple-900/50',  text: 'text-purple-900 dark:text-purple-300',  hover: 'hover:bg-purple-300 dark:hover:bg-purple-800/50' },
  'purple-40':  { bg: 'bg-purple-300 dark:bg-purple-800/50',  text: 'text-purple-900 dark:text-purple-300',  hover: 'hover:bg-purple-400 dark:hover:bg-purple-500' },
  'purple-60':  { bg: 'bg-purple-400 dark:bg-purple-500',     text: 'text-white',                            hover: 'hover:bg-purple-500 dark:hover:bg-purple-600' },
  'purple-80':  { bg: 'bg-purple-500 dark:bg-purple-600',     text: 'text-white',                            hover: 'hover:bg-purple-600 dark:hover:bg-purple-500' },
  'purple-100': { bg: 'bg-purple-600 dark:bg-purple-500',     text: 'text-white',                            hover: 'hover:bg-purple-700 dark:hover:bg-purple-600' },

  // ─── Pink ─────────────────────────────────────────────────────
  'pink-10':  { bg: 'bg-pink-100 dark:bg-pink-900/40',  text: 'text-pink-900 dark:text-pink-300',  hover: 'hover:bg-pink-200 dark:hover:bg-pink-900/50' },
  'pink-25':  { bg: 'bg-pink-200 dark:bg-pink-900/50',  text: 'text-pink-900 dark:text-pink-300',  hover: 'hover:bg-pink-300 dark:hover:bg-pink-800/50' },
  'pink-40':  { bg: 'bg-pink-300 dark:bg-pink-800/50',  text: 'text-pink-900 dark:text-pink-300',  hover: 'hover:bg-pink-400 dark:hover:bg-pink-500' },
  'pink-60':  { bg: 'bg-pink-400 dark:bg-pink-500',     text: 'text-white',                        hover: 'hover:bg-pink-500 dark:hover:bg-pink-600' },
  'pink-80':  { bg: 'bg-pink-500 dark:bg-pink-600',     text: 'text-white',                        hover: 'hover:bg-pink-600 dark:hover:bg-pink-500' },
  'pink-100': { bg: 'bg-pink-600 dark:bg-pink-500',     text: 'text-white',                        hover: 'hover:bg-pink-700 dark:hover:bg-pink-600' },

  // ─── Slate ────────────────────────────────────────────────────
  'slate-10':  { bg: 'bg-slate-100 dark:bg-slate-800',  text: 'text-slate-900 dark:text-slate-100',  hover: 'hover:bg-slate-200 dark:hover:bg-slate-700' },
  'slate-25':  { bg: 'bg-slate-200 dark:bg-slate-700',  text: 'text-slate-900 dark:text-slate-100',  hover: 'hover:bg-slate-300 dark:hover:bg-slate-600' },
  'slate-40':  { bg: 'bg-slate-300 dark:bg-slate-600',  text: 'text-slate-900 dark:text-slate-100',  hover: 'hover:bg-slate-400 dark:hover:bg-slate-500' },
  'slate-60':  { bg: 'bg-slate-400 dark:bg-slate-500',  text: 'text-white',                          hover: 'hover:bg-slate-500 dark:hover:bg-slate-400' },
  'slate-80':  { bg: 'bg-slate-500 dark:bg-slate-400',  text: 'text-white',                          hover: 'hover:bg-slate-600 dark:hover:bg-slate-500' },
  'slate-100': { bg: 'bg-slate-600 dark:bg-slate-500',  text: 'text-white',                          hover: 'hover:bg-slate-700 dark:hover:bg-slate-600' },
};

const DEFAULT_TILE = { bg: 'bg-blue-500 dark:bg-blue-600', text: 'text-white', hover: 'hover:bg-blue-600 dark:hover:bg-blue-500' };

export function getTileColors(color: FavoriteColor, shade: number = 80) {
  return TILE_COLORS[`${color}-${shade}`] ?? TILE_COLORS[`${color}-80`] ?? DEFAULT_TILE;
}

export const TYPE_ICONS: Record<string, typeof Package> = {
  product: Package,
  service: Wrench,
  custom_amount: DollarSign,
  customer_lookup: Users,
  discount: Tag,
  surcharge: Percent,
};
