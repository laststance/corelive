CREATE TABLE "CategoryDeletion" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"sourceId" integer NOT NULL,
	"destinationId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "CategoryDeletion_distinct_categories_check" CHECK ("CategoryDeletion"."sourceId" > 0 AND "CategoryDeletion"."destinationId" > 0 AND "CategoryDeletion"."sourceId" <> "CategoryDeletion"."destinationId")
);
--> statement-breakpoint
ALTER TABLE "CategoryDeletion" ADD CONSTRAINT "CategoryDeletion_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "CategoryDeletion_userId_id_idx" ON "CategoryDeletion" USING btree ("userId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "CategoryDeletion_sourceId_key" ON "CategoryDeletion" USING btree ("sourceId");