ALTER TABLE "eval_runs" ADD COLUMN "billing" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "billing" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_billing_ck" CHECK ("eval_runs"."billing" in ('api','subscription'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_failure_reason_ck" CHECK ("agent_runs"."failure_reason" is null or "agent_runs"."failure_reason" in ('cli_missing','token_missing','auth_failed','rate_limited','timeout','invalid_output','cli_error'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_billing_ck" CHECK ("agent_runs"."billing" in ('api','subscription'));