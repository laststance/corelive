CREATE TABLE "CompletionSyncReceipt" (
	"userId" integer NOT NULL,
	"operationId" text NOT NULL,
	"payloadDigest" text NOT NULL,
	"outcome" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "CompletionSyncReceipt_userId_operationId_pk" PRIMARY KEY("userId","operationId")
);
--> statement-breakpoint
CREATE TABLE "CompletionSyncState" (
	"userId" integer NOT NULL,
	"completionId" text NOT NULL,
	"revision" integer NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"completedId" integer,
	"categoryId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"completedAt" timestamp (3) NOT NULL,
	"originalCompletedAt" timestamp (3) NOT NULL,
	"timezone" text NOT NULL,
	"deviceId" text NOT NULL,
	CONSTRAINT "CompletionSyncState_userId_completionId_pk" PRIMARY KEY("userId","completionId")
);
--> statement-breakpoint
ALTER TABLE "CompletionSyncReceipt" ADD CONSTRAINT "CompletionSyncReceipt_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompletionSyncState" ADD CONSTRAINT "CompletionSyncState_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompletionSyncState" ADD CONSTRAINT "CompletionSyncState_completedId_Completed_id_fk" FOREIGN KEY ("completedId") REFERENCES "public"."Completed"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "CompletionSyncState_userId_categoryId_idx" ON "CompletionSyncState" USING btree ("userId","categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "CompletionSyncState_completedId_key" ON "CompletionSyncState" USING btree ("completedId");