-- Rental inventory: stock, sub-rental, replacement cost, buffer days.
-- Enables WMS: prevent overbooking, damage invoices, turnaround time.
-- ARCHIVED: Applied as rental_inventory_packages_columns (20260223021714). Do not run again.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_sub_rental boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replacement_cost numeric CHECK (replacement_cost IS NULL OR replacement_cost >= 0),
  ADD COLUMN IF NOT EXISTS buffer_days integer NOT NULL DEFAULT 0 CHECK (buffer_days >= 0);

COMMENT ON COLUMN public.packages.stock_quantity IS 'Total units owned/available (rental). Used to block overbooking.';
COMMENT ON COLUMN public.packages.is_sub_rental IS 'When true, item is sourced from 3rd party; target cost = vendor rental cost.';
COMMENT ON COLUMN public.packages.replacement_cost IS 'Charge to client if item is destroyed/lost (rental).';
COMMENT ON COLUMN public.packages.buffer_days IS 'Days needed for cleaning/prep before item can be rented again.';
