-- The refund tables, for when the demo store (lib/copper/refunds/store.ts) is
-- swapped for a real Postgres database such as Supabase. The app does not use
-- this file yet: it runs on an in-memory store that resets on restart.
-- Row Level Security is on with no public policies, so only the server (with
-- the service-role key) can read or write.

create table if not exists customers (
  email text primary key,
  name text not null
);

create table if not exists orders (
  id text primary key,
  customer_email text not null references customers (email),
  kind text not null check (kind in ('device', 'plan')),
  product text not null,
  color text,
  sku text,
  billing text check (billing in ('monthly', 'annual')),
  amount_usd numeric(10, 2) not null,
  purchased_at timestamptz not null,
  refund_status text not null default 'none'
    check (refund_status in ('none', 'pending', 'refunded'))
);

create table if not exists inventory (
  sku text primary key,
  product text not null,
  color text not null,
  units_in_stock integer not null,
  next_shipment date
);

create table if not exists refund_requests (
  id text primary key, -- like REQ-1001
  order_id text not null references orders (id),
  customer_email text not null,
  kind text not null,
  product text not null,
  sku text,
  reason text not null,
  agent_summary text not null,
  amount_usd numeric(10, 2) not null,
  rule_applied text not null,
  recommendation text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists settings (
  key text primary key,
  value text not null
);

alter table customers enable row level security;
alter table orders enable row level security;
alter table inventory enable row level security;
alter table refund_requests enable row level security;
alter table settings enable row level security;
