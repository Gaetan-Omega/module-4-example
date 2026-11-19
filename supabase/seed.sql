-- The six demo customers and their orders, matching lib/copper/refunds/store.ts.
-- Re-running this resets the demo data, including the auto-refund limit ($100).
-- Stock rows come from lib/copper/data/inventory.json (Product Bible section 10).

truncate refund_requests, orders, customers, settings restart identity cascade;

insert into customers (email, name) values
  ('ava@example.com', 'Ava'),
  ('finn@example.com', 'Finn'),
  ('cara@example.com', 'Cara'),
  ('ben@example.com', 'Ben'),
  ('dan@example.com', 'Dan'),
  ('eve@example.com', 'Eve');

insert into orders (id, customer_email, kind, product, color, sku, billing, amount_usd, purchased_at) values
  ('ORD-1001', 'ava@example.com',  'device', 'Copper Home',  'Night Sky',       'CH-NSK', null,      149,  now() - interval '10 days'),
  ('ORD-1002', 'finn@example.com', 'device', 'Copper Home',  'Polished Copper', 'CH-POL', null,      149,  now() - interval '10 days'),
  ('ORD-1003', 'cara@example.com', 'plan',   'Copper Plus',  null,              null,     'annual',  79,   now() - interval '5 days'),
  ('ORD-1004', 'ben@example.com',  'device', 'Copper Notes', 'Brushed Copper',  'CN-BRC', null,      129,  now() - interval '45 days'),
  ('ORD-1005', 'dan@example.com',  'plan',   'Copper Plus',  null,              null,     'annual',  79,   now() - interval '40 days'),
  ('ORD-1006', 'eve@example.com',  'plan',   'Copper Plus',  null,              null,     'monthly', 7.99, now() - interval '20 days');

insert into settings (key, value) values ('auto_refund_limit_usd', '100');
