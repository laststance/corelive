CREATE TABLE "Category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Completed" (
	"id" serial PRIMARY KEY NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"title" varchar(255) NOT NULL,
	"userId" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"completedAt" timestamp (3),
	"importBatchId" text,
	"localCompletionId" text
);
--> statement-breakpoint
CREATE TABLE "ElectronSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"hideAppIcon" boolean DEFAULT false NOT NULL,
	"showInMenuBar" boolean DEFAULT true NOT NULL,
	"startAtLogin" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ImportBatch" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "NodeAssignment" (
	"id" serial PRIMARY KEY NOT NULL,
	"nodeId" integer NOT NULL,
	"todoId" integer,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"todoText" varchar(255) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "NodeEdge" (
	"id" serial PRIMARY KEY NOT NULL,
	"skillTreeId" integer NOT NULL,
	"fromNodeId" integer NOT NULL,
	"toNodeId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SkillNode" (
	"id" serial PRIMARY KEY NOT NULL,
	"skillTreeId" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
-- Hand-ordered: NodeEdge's composite FKs reference this unique index, and PostgreSQL requires it to exist
-- BEFORE the FK is added. drizzle-kit emits every FK ahead of every index, which fails with 42830.
CREATE UNIQUE INDEX "SkillNode_skillTreeId_id_key" ON "SkillNode" USING btree ("skillTreeId","id");--> statement-breakpoint
CREATE TABLE "SkillTree" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" text NOT NULL,
	"templateKey" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Todo" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" varchar(255) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"userId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"order" integer,
	"categoryId" integer NOT NULL,
	"importBatchId" text,
	"completedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerkId" text NOT NULL,
	"email" text,
	"name" text,
	"bio" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ElectronSettings" ADD CONSTRAINT "ElectronSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "NodeAssignment" ADD CONSTRAINT "NodeAssignment_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "public"."SkillNode"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "NodeAssignment" ADD CONSTRAINT "NodeAssignment_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "public"."Todo"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_fkey" FOREIGN KEY ("skillTreeId") REFERENCES "public"."SkillTree"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_fromNodeId_fkey" FOREIGN KEY ("skillTreeId","fromNodeId") REFERENCES "public"."SkillNode"("skillTreeId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_toNodeId_fkey" FOREIGN KEY ("skillTreeId","toNodeId") REFERENCES "public"."SkillNode"("skillTreeId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SkillNode" ADD CONSTRAINT "SkillNode_skillTreeId_fkey" FOREIGN KEY ("skillTreeId") REFERENCES "public"."SkillTree"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SkillTree" ADD CONSTRAINT "SkillTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Category_name_userId_key" ON "Category" USING btree ("name","userId");--> statement-breakpoint
CREATE INDEX "Completed_categoryId_idx" ON "Completed" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "Completed_importBatchId_idx" ON "Completed" USING btree ("importBatchId");--> statement-breakpoint
CREATE UNIQUE INDEX "Completed_userId_localCompletionId_key" ON "Completed" USING btree ("userId","localCompletionId");--> statement-breakpoint
CREATE UNIQUE INDEX "ElectronSettings_userId_key" ON "ElectronSettings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ImportBatch_userId_idx" ON "ImportBatch" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "NodeAssignment_nodeId_idx" ON "NodeAssignment" USING btree ("nodeId");--> statement-breakpoint
CREATE UNIQUE INDEX "NodeAssignment_todoId_key" ON "NodeAssignment" USING btree ("todoId");--> statement-breakpoint
CREATE UNIQUE INDEX "NodeEdge_fromNodeId_toNodeId_key" ON "NodeEdge" USING btree ("fromNodeId","toNodeId");--> statement-breakpoint
CREATE INDEX "NodeEdge_skillTreeId_idx" ON "NodeEdge" USING btree ("skillTreeId");--> statement-breakpoint
CREATE INDEX "NodeEdge_toNodeId_idx" ON "NodeEdge" USING btree ("toNodeId");--> statement-breakpoint
CREATE INDEX "SkillNode_skillTreeId_idx" ON "SkillNode" USING btree ("skillTreeId");--> statement-breakpoint
CREATE UNIQUE INDEX "SkillTree_userId_key" ON "SkillTree" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Todo_categoryId_idx" ON "Todo" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "Todo_importBatchId_idx" ON "Todo" USING btree ("importBatchId");--> statement-breakpoint
CREATE UNIQUE INDEX "User_clerkId_key" ON "User" USING btree ("clerkId");--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" USING btree ("email");