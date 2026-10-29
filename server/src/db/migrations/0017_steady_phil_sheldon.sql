CREATE TABLE "repo_agent_states" (
	"repo_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"active" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_agent_states_repo_id_agent_id_pk" PRIMARY KEY("repo_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "languages" jsonb;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "languages_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "languages_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "languages_failure" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "languages" jsonb;--> statement-breakpoint
ALTER TABLE "repo_agent_states" ADD CONSTRAINT "repo_agent_states_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_agent_states" ADD CONSTRAINT "repo_agent_states_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repo_agent_states_agent_idx" ON "repo_agent_states" USING btree ("agent_id");