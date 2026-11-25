CREATE VIEW "public"."stock_average_cost" AS (
  select si.id as stock_item_id,
         (select m.avg_unit_cost_after_usd
            from stock_movements m
           where m.stock_item_id = si.id and m.deleted_at is null and m.avg_unit_cost_after_usd is not null
           order by m.moved_at desc, m.id desc
           limit 1) as avg_unit_cost_usd
  from stock_items si
  where si.deleted_at is null
);--> statement-breakpoint
ALTER VIEW "public"."stock_average_cost" SET (security_invoker = true);
