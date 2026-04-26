// Regenerate docs/dev/DB_SCHEMA.md from the linked Supabase project's live schema.
//
// Usage:   npx tsx scripts/regen-db-schema.ts
// Auth:    delegates to the supabase CLI's linked-project Management API session
//          (run `supabase login` and `supabase link` once if not already set up).
// Env:     reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
//          SUPABASE_SERVICE_ROLE_KEY from .env.local as a project-context guard
//          to ensure regeneration runs against the expected project.
//
// Output:  overwrites docs/dev/DB_SCHEMA.md with an auto-generated header.
// Exit:    non-zero on any missing env var, CLI failure, or query error.

import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, sep } from 'path';
import * as dotenv from 'dotenv';

const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env.local');
const OUT_PATH = resolve(ROOT, 'docs/dev/DB_SCHEMA.md');

dotenv.config({ path: ENV_PATH });

function fail(msg: string): never {
  console.error(`✗ regen-db-schema: ${msg}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) {
  fail('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) in .env.local');
}
if (!serviceRoleKey) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const projectRef = (() => {
  const m = supabaseUrl!.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) fail(`Could not parse project ref from SUPABASE_URL: ${supabaseUrl}`);
  return m![1];
})();

// `npx tsx` prepends node_modules/.bin to PATH, which often contains an older
// vendored supabase CLI that predates the `db query` subcommand. Resolve to
// the first binary on PATH (or in known install locations) that supports it.
function resolveSupabaseCli(): string {
  const candidates: string[] = [];
  const pathEntries = (process.env.PATH || '').split(':').filter(Boolean);
  // Prefer system installs (homebrew, /usr/local) over node_modules/.bin
  for (const dir of pathEntries) {
    if (dir.includes(`${sep}node_modules${sep}.bin`)) continue;
    candidates.push(`${dir}/supabase`);
  }
  // Common fallbacks
  candidates.push('/opt/homebrew/bin/supabase', '/usr/local/bin/supabase');
  // Last resort: bare PATH lookup (whatever resolves)
  candidates.push('supabase');

  for (const cli of candidates) {
    try {
      const out = execFileSync(cli, ['db', 'query', '--help'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (out.toLowerCase().includes('execute a sql query')) return cli;
    } catch {
      // try next candidate
    }
  }
  fail(
    'Could not find a supabase CLI that supports `db query` (need v2.80+). ' +
      'Install/upgrade via `brew install supabase/tap/supabase` or `brew upgrade supabase`.',
  );
}

const SUPABASE_CLI = resolveSupabaseCli();

function runQuery<T = Record<string, unknown>>(sql: string): T[] {
  let stdout: string;
  try {
    stdout = execFileSync(
      SUPABASE_CLI,
      ['db', 'query', '--linked', '--agent=no', '--output', 'json', sql],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf-8') ?? '';
    fail(`supabase db query failed.\nSQL: ${sql.split('\n')[0].slice(0, 120)}…\nstderr: ${stderr || e.message}`);
  }
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      fail(`Unexpected query response shape (expected array). Got: ${stdout.slice(0, 200)}`);
    }
    return parsed as T[];
  } catch {
    fail(`Could not parse query JSON output. First 500 chars: ${stdout.slice(0, 500)}`);
  }
}

function ensureLinkedToExpectedProject() {
  let listOut: string;
  try {
    listOut = execFileSync(SUPABASE_CLI, ['projects', 'list'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    fail(`Could not list supabase projects. Is the CLI installed and logged in? ${(err as Error).message}`);
  }
  // A linked project is marked with a bullet (●) in the LINKED column.
  const linkedLine = listOut.split('\n').find((l) => l.includes('●'));
  if (!linkedLine) fail('No linked Supabase project found. Run `supabase link --project-ref <ref>` first.');
  if (!linkedLine.includes(projectRef)) {
    fail(
      `Linked project does not match SUPABASE_URL. .env.local points at ${projectRef}, ` +
        `but the CLI is linked to a different project. Linked line: ${linkedLine.trim()}`,
    );
  }
}

// ── SQL helpers ────────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  'character varying': 'VARCHAR',
  'character': 'CHAR',
  'integer': 'INTEGER',
  'bigint': 'BIGINT',
  'smallint': 'SMALLINT',
  'real': 'REAL',
  'double precision': 'DOUBLE PRECISION',
  'numeric': 'NUMERIC',
  'boolean': 'BOOLEAN',
  'text': 'TEXT',
  'uuid': 'UUID',
  'jsonb': 'JSONB',
  'json': 'JSON',
  'date': 'DATE',
  'timestamp without time zone': 'TIMESTAMP',
  'timestamp with time zone': 'TIMESTAMPTZ',
  'time without time zone': 'TIME',
  'time with time zone': 'TIMETZ',
  'bytea': 'BYTEA',
};

function formatType(col: ColumnRow): string {
  const dt = col.data_type;
  if (dt === 'ARRAY') {
    // udt_name for an array is _<element_type> (e.g., _text)
    const elem = (col.udt_name || '').replace(/^_/, '');
    return `${(TYPE_MAP[elem] || elem).toUpperCase()}[]`;
  }
  if (dt === 'USER-DEFINED') {
    return `${col.udt_name} (enum)`;
  }
  if (dt === 'numeric' && col.numeric_precision != null) {
    if (col.numeric_scale != null && col.numeric_scale !== 0) {
      return `NUMERIC(${col.numeric_precision},${col.numeric_scale})`;
    }
    return `NUMERIC(${col.numeric_precision})`;
  }
  if ((dt === 'character varying' || dt === 'character') && col.character_maximum_length) {
    const base = TYPE_MAP[dt];
    return `${base}(${col.character_maximum_length})`;
  }
  return TYPE_MAP[dt] || dt.toUpperCase();
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ── Row types ──────────────────────────────────────────────────────────────────

type TableRow = { table_name: string };
type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  ordinal_position: number;
};
type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: 'PRIMARY KEY' | 'UNIQUE';
  cols: string;
};
type FkRow = {
  table_name: string;
  constraint_name: string;
  def: string;
};
type CheckRow = {
  table_name: string;
  constraint_name: string;
  def: string;
};
type IndexRow = {
  tablename: string;
  indexname: string;
  indexdef: string;
};
type EnumRow = {
  enum_name: string;
  enumlabel: string;
  enumsortorder: number;
};

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  ensureLinkedToExpectedProject();

  console.log(`→ Regenerating DB schema doc against project ${projectRef}…`);

  const tables = runQuery<TableRow>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name;`,
  );
  console.log(`  · ${tables.length} tables`);

  const columns = runQuery<ColumnRow>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable,
            column_default, character_maximum_length, numeric_precision, numeric_scale,
            ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position;`,
  );
  console.log(`  · ${columns.length} columns`);

  const pkUnique = runQuery<ConstraintRow>(
    `SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
            string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       USING (constraint_schema, constraint_name, table_schema, table_name)
     WHERE tc.table_schema = 'public'
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
     ORDER BY tc.table_name, tc.constraint_type DESC, tc.constraint_name;`,
  );
  console.log(`  · ${pkUnique.length} PK/UNIQUE constraints`);

  const fks = runQuery<FkRow>(
    `SELECT conrelid::regclass::text AS table_name,
            conname AS constraint_name,
            pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE contype = 'f' AND connamespace = 'public'::regnamespace
     ORDER BY conrelid::regclass::text, conname;`,
  );
  console.log(`  · ${fks.length} foreign keys`);

  const checks = runQuery<CheckRow>(
    `SELECT conrelid::regclass::text AS table_name,
            conname AS constraint_name,
            pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE contype = 'c' AND connamespace = 'public'::regnamespace
       AND conname NOT LIKE '%_not_null'
     ORDER BY conrelid::regclass::text, conname;`,
  );
  console.log(`  · ${checks.length} check constraints`);

  const indexes = runQuery<IndexRow>(
    `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname;`,
  );
  console.log(`  · ${indexes.length} indexes`);

  const enums = runQuery<EnumRow>(
    `SELECT t.typname AS enum_name, e.enumlabel, e.enumsortorder
     FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     ORDER BY t.typname, e.enumsortorder;`,
  );
  console.log(`  · ${enums.length} enum values`);

  // ── Group lookups by table ──
  const colsByTable = new Map<string, ColumnRow[]>();
  columns.forEach((c) => {
    if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
    colsByTable.get(c.table_name)!.push(c);
  });

  const pksByTable = new Map<string, string[]>(); // tableName → PK column names
  const uniqueColsByTable = new Map<string, Set<string>>(); // single-col uniques
  const compositeUniqueByTable = new Map<string, ConstraintRow[]>();
  pkUnique.forEach((c) => {
    const cols = c.cols.split(', ');
    if (c.constraint_type === 'PRIMARY KEY') {
      pksByTable.set(c.table_name, cols);
    } else {
      if (cols.length === 1) {
        if (!uniqueColsByTable.has(c.table_name)) uniqueColsByTable.set(c.table_name, new Set());
        uniqueColsByTable.get(c.table_name)!.add(cols[0]);
      } else {
        if (!compositeUniqueByTable.has(c.table_name)) compositeUniqueByTable.set(c.table_name, []);
        compositeUniqueByTable.get(c.table_name)!.push(c);
      }
    }
  });

  const fksByTable = new Map<string, FkRow[]>();
  fks.forEach((f) => {
    if (!fksByTable.has(f.table_name)) fksByTable.set(f.table_name, []);
    fksByTable.get(f.table_name)!.push(f);
  });

  const fksByColumn = new Map<string, string>(); // "table.column" → "FK → ref(col) ..."
  fks.forEach((f) => {
    // Parse: FOREIGN KEY (col1[, col2]) REFERENCES other_table(other_col1[, other_col2]) [ON DELETE X] [ON UPDATE Y]
    const m = f.def.match(
      /^FOREIGN KEY \(([^)]+)\) REFERENCES ([\w.]+)\(([^)]+)\)(.*)$/,
    );
    if (!m) return;
    const localCols = m[1].split(',').map((s) => s.trim());
    const refTable = m[2].replace(/^public\./, '');
    const refCols = m[3].split(',').map((s) => s.trim());
    const tail = m[4].trim();
    if (localCols.length === 1 && refCols.length === 1) {
      const note = `FK → ${refTable}(${refCols[0]})${tail ? ' ' + tail : ''}`;
      fksByColumn.set(`${f.table_name}.${localCols[0]}`, note);
    }
  });

  const checksByTable = new Map<string, CheckRow[]>();
  checks.forEach((c) => {
    if (!checksByTable.has(c.table_name)) checksByTable.set(c.table_name, []);
    checksByTable.get(c.table_name)!.push(c);
  });

  const indexesByTable = new Map<string, IndexRow[]>();
  indexes.forEach((i) => {
    if (!indexesByTable.has(i.tablename)) indexesByTable.set(i.tablename, []);
    indexesByTable.get(i.tablename)!.push(i);
  });

  const enumsByName = new Map<string, string[]>();
  enums.forEach((e) => {
    if (!enumsByName.has(e.enum_name)) enumsByName.set(e.enum_name, []);
    enumsByName.get(e.enum_name)!.push(e.enumlabel);
  });

  // ── Render ──
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(
    `<!-- AUTO-GENERATED by scripts/regen-db-schema.ts on ${today}. Do not edit by hand. Run \`npx tsx scripts/regen-db-schema.ts\` to refresh. -->`,
  );
  lines.push('');
  lines.push('# Smart Details Auto Spa — Database Schema Reference');
  lines.push('');
  lines.push(`> Auto-generated from the live database (project: \`${projectRef}\`).`);
  lines.push(`> ${tables.length} tables in the \`public\` schema. Last regenerated: ${today}.`);
  lines.push('>');
  lines.push(
    '> **This file is not hand-edited.** Hand-curated notes (column descriptions, narrative paragraphs, receipt-system architecture, etc.) that previously lived here have been replaced with auto-derived metadata. To preserve cross-cutting documentation, write it in `docs/dev/ARCHITECTURE.md` or a topic-specific file under `docs/dev/`.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // Tables (alphabetical)
  for (const { table_name } of tables) {
    lines.push(`## ${table_name}`);
    lines.push('');

    const cols = colsByTable.get(table_name) || [];
    const pkCols = new Set(pksByTable.get(table_name) || []);
    const uniqueCols = uniqueColsByTable.get(table_name) || new Set();

    lines.push('| Column | Type | Constraints | Notes |');
    lines.push('|--------|------|-------------|-------|');
    for (const col of cols) {
      const constraintParts: string[] = [];
      if (pkCols.has(col.column_name)) constraintParts.push('PK');
      if (uniqueCols.has(col.column_name) && !pkCols.has(col.column_name)) constraintParts.push('UNIQUE');
      if (col.is_nullable === 'NO') constraintParts.push('NOT NULL');
      if (col.column_default) {
        constraintParts.push(`DEFAULT ${col.column_default}`);
      }
      const fkNote = fksByColumn.get(`${table_name}.${col.column_name}`);
      if (fkNote) constraintParts.push(fkNote);

      const notes: string[] = [];
      if (col.data_type === 'USER-DEFINED' && enumsByName.has(col.udt_name)) {
        notes.push(`enum values: ${enumsByName.get(col.udt_name)!.join(', ')}`);
      }

      lines.push(
        `| ${escapeMd(col.column_name)} | ${escapeMd(formatType(col))} | ${escapeMd(
          constraintParts.join(', ') || '—',
        )} | ${escapeMd(notes.join('; '))} |`,
      );
    }
    lines.push('');

    // Composite uniques
    const compUniques = compositeUniqueByTable.get(table_name) || [];
    if (compUniques.length > 0) {
      lines.push('**Composite UNIQUE constraints:**');
      for (const u of compUniques) {
        lines.push(`- \`${u.constraint_name}\` (${u.cols})`);
      }
      lines.push('');
    }

    // Multi-column FKs (single-col FKs are already inlined above)
    const tableFks = fksByTable.get(table_name) || [];
    const multiFks = tableFks.filter((f) => {
      const m = f.def.match(/^FOREIGN KEY \(([^)]+)\)/);
      return m ? m[1].split(',').length > 1 : false;
    });
    if (multiFks.length > 0) {
      lines.push('**Composite FOREIGN KEYs:**');
      for (const fk of multiFks) {
        lines.push(`- \`${fk.constraint_name}\`: ${fk.def}`);
      }
      lines.push('');
    }

    // CHECK constraints
    const tableChecks = checksByTable.get(table_name) || [];
    if (tableChecks.length > 0) {
      lines.push('**CHECK constraints:**');
      for (const c of tableChecks) {
        lines.push(`- \`${c.constraint_name}\`: \`${c.def}\``);
      }
      lines.push('');
    }

    // Indexes
    const tableIndexes = indexesByTable.get(table_name) || [];
    if (tableIndexes.length > 0) {
      lines.push('**Indexes:**');
      lines.push('```');
      for (const idx of tableIndexes) {
        lines.push(idx.indexdef);
      }
      lines.push('```');
      lines.push('');
    }

    lines.push('');
  }

  // Enums section
  if (enumsByName.size > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Enums');
    lines.push('');
    const enumNames = Array.from(enumsByName.keys()).sort();
    for (const name of enumNames) {
      const values = enumsByName.get(name)!;
      lines.push(`- \`${name}\`: ${values.map((v) => `\`${v}\``).join(', ')}`);
    }
    lines.push('');
  }

  const output = lines.join('\n') + '\n';

  let oldLineCount = 0;
  if (existsSync(OUT_PATH)) {
    oldLineCount = readFileSync(OUT_PATH, 'utf-8').split('\n').length;
  }
  writeFileSync(OUT_PATH, output, 'utf-8');
  const newLineCount = output.split('\n').length;
  console.log('');
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  Old: ${oldLineCount} lines → New: ${newLineCount} lines`);
  if (oldLineCount > 0) {
    const pct = ((newLineCount - oldLineCount) / oldLineCount) * 100;
    const sign = pct >= 0 ? '+' : '';
    console.log(`  Δ: ${sign}${pct.toFixed(1)}%`);
    if (pct < -20) {
      console.warn(
        '  ⚠ Regenerated doc is more than 20% smaller than the previous version. ' +
          'Inspect before committing — script may be missing tables.',
      );
    }
  }
}

main();
