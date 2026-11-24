CREATE TABLE "warehouse_asset_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"balance" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "warehouse_assets_name_vendor_unique" UNIQUE("name","vendor"),
	CONSTRAINT "warehouse_assets_nonnegative" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sku" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"minimum" integer DEFAULT 0 NOT NULL,
	"lead_days" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"zone" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"balance" integer NOT NULL,
	"lot" text DEFAULT '' NOT NULL,
	"expiry" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"quantity" integer NOT NULL,
	"partner" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "warehouse_order_quantity_positive" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot" text DEFAULT '' NOT NULL,
	"expiry" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "warehouse_stock_item_id_location_id_lot_expiry_unique" UNIQUE("item_id","location_id","lot","expiry"),
	CONSTRAINT "warehouse_stock_nonnegative" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
CREATE INDEX "warehouse_asset_movements_created_at_index" ON "warehouse_asset_movements" ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_movements_created_at_index" ON "warehouse_movements" ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_movements_item_id_created_at_index" ON "warehouse_movements" ("item_id","created_at");--> statement-breakpoint
ALTER TABLE "warehouse_asset_movements" ADD CONSTRAINT "warehouse_asset_movements_asset_id_warehouse_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "warehouse_assets"("id");--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_item_id_warehouse_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id");--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_location_id_warehouse_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id");--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_order_id_warehouse_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "warehouse_orders"("id");--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_item_id_warehouse_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id");--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_location_id_warehouse_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id");--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_item_id_warehouse_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "warehouse_items"("id");--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_location_id_warehouse_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id");