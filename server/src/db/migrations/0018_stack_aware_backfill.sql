UPDATE agents SET languages = '["TypeScript","JavaScript"]'
  WHERE name IN ('General Reviewer','Security Reviewer','Performance Reviewer','Test Quality Reviewer');--> statement-breakpoint
UPDATE agents SET languages = '["Python"]'
  WHERE name IN ('General Reviewer (Python)','Security Reviewer (Python)','Performance Reviewer (Python)','Test Quality Reviewer (Python)');--> statement-breakpoint
INSERT INTO repo_agent_states (repo_id, agent_id, active)
  SELECT r.id, a.id, a.enabled FROM repos r JOIN agents a ON a.workspace_id = r.workspace_id
  ON CONFLICT DO NOTHING;
