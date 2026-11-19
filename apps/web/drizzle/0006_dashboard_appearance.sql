CREATE TABLE "DashboardAppearance" (
	"userId" integer PRIMARY KEY NOT NULL,
	"theme" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DashboardAppearance" ADD CONSTRAINT "DashboardAppearance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;