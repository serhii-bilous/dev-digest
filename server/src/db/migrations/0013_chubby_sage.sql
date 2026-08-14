ALTER TABLE "skill_versions" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "critical_count" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "warning_count" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "suggestion_count" integer;--> statement-breakpoint
CREATE INDEX "reviews_pr_created_idx" ON "reviews" USING btree ("pr_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skills_workspace_idx" ON "skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_skills_skill_idx" ON "agent_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_ran_at_idx" ON "agent_runs" USING btree ("pr_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_type_ck" CHECK ("skills"."type" in ('rubric', 'convention', 'security', 'custom'));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_ck" CHECK ("skills"."source" in ('manual', 'imported_url', 'extracted', 'community'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_ck" CHECK ("agent_runs"."status" in ('running', 'done', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_source_ck" CHECK ("agent_runs"."source" in ('local', 'ci'));