-- Cash drawers for end-of-day tracking
create table if not exists cash_drawers (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(10,2) not null default 0,
  expected_cash numeric(10,2),
  counted_cash numeric(10,2),
  variance numeric(10,2),
  deposit_amount numeric(10,2),
  next_day_float numeric(10,2),
  cash_sales numeric(10,2) default 0,
  cash_tips numeric(10,2) default 0,
  cash_refunds numeric(10,2) default 0,
  total_transactions int default 0,
  total_revenue numeric(10,2) default 0,
  total_tax numeric(10,2) default 0,
  total_tips numeric(10,2) default 0,
  total_refunds numeric(10,2) default 0,
  opened_by uuid references employees(id),
  closed_by uuid references employees(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table cash_drawers enable row level security;

create policy "Authenticated users can read cash_drawers"
  on cash_drawers for select
  to authenticated
  using (true);

create policy "Authenticated users can insert cash_drawers"
  on cash_drawers for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update cash_drawers"
  on cash_drawers for update
  to authenticated
  using (true);
