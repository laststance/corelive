DROP INDEX "Category_name_userId_key";--> statement-breakpoint
ALTER TABLE "Category" ADD COLUMN "parentId" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category" USING btree ("id","userId");--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_owner_fkey" FOREIGN KEY ("parentId","userId") REFERENCES "public"."Category"("id","userId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "Category_root_name_userId_key" ON "Category" USING btree ("name","userId") WHERE "Category"."parentId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "Category_child_name_parent_userId_key" ON "Category" USING btree ("name","parentId","userId") WHERE "Category"."parentId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "Category_userId_parentId_idx" ON "Category" USING btree ("userId","parentId");--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_self_parent_check" CHECK ("Category"."parentId" IS NULL OR "Category"."parentId" <> "Category"."id");--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_default_is_root_check" CHECK (NOT "Category"."isDefault" OR "Category"."parentId" IS NULL);