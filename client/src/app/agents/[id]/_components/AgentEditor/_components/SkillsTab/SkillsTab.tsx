/* SkillsTab — attach/detach + reorder the agent's linked skills. Attachment
   is a Checkbox (membership in agent_skills), not the Toggle used for a
   skill's own global `enabled` flag elsewhere — this tab only controls
   linkage, per the agents.json copy ("Toggle to attach"). Reorder supports
   both a GripVertical drag handle (native HTML5 DnD — no DnD library in this
   codebase, so no library was added) and the original ArrowUp/ArrowDown
   buttons, kept as a keyboard/no-mouse fallback. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, TextInput, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkillLinks, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { TYPE_COLOR } from "./constants";
import { s } from "./styles";

type DropPosition = "before" | "after";

function reorder(ids: string[], draggedId: string, targetId: string, position: DropPosition): string[] {
  if (draggedId === targetId) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const targetIdx = without.indexOf(targetId);
  if (targetIdx === -1) return ids;
  const insertAt = position === "after" ? targetIdx + 1 : targetIdx;
  without.splice(insertAt, 0, draggedId);
  return without;
}

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkillLinks(agentId);
  const setSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; position: DropPosition } | null>(null);

  if (skillsLoading || linksLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ height: 12 }} />
        <Skeleton height={200} />
      </div>
    );
  }

  const linkedIds = (links ?? []).map((l) => l.skill_id);
  const orderIndex = new Map(linkedIds.map((id, i) => [id, i]));

  const q = filter.trim().toLowerCase();
  const filtered = (skills ?? []).filter((sk) => !q || sk.name.toLowerCase().includes(q));
  const sorted = [...filtered].sort((a, b) => {
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return 0;
  });

  const setOrder = (ids: string[]) => setSkills.mutate({ agentId, skillIds: ids });

  const toggle = (skillId: string, attach: boolean) => {
    setOrder(attach ? [...linkedIds, skillId] : linkedIds.filter((id) => id !== skillId));
  };

  const move = (skillId: string, dir: -1 | 1) => {
    const idx = linkedIds.indexOf(skillId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= linkedIds.length) return;
    const reordered = [...linkedIds];
    [reordered[idx], reordered[next]] = [reordered[next]!, reordered[idx]!];
    setOrder(reordered);
  };

  const handleDragStart = (e: React.DragEvent, skillId: string) => {
    setDraggedId(skillId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", skillId);
  };

  const handleDragOver = (e: React.DragEvent, skillId: string) => {
    if (!draggedId || !orderIndex.has(skillId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (skillId === draggedId) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position: DropPosition = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget((prev) => (prev?.id === skillId && prev.position === position ? prev : { id: skillId, position }));
  };

  const handleDrop = (e: React.DragEvent, skillId: string) => {
    if (!draggedId || !orderIndex.has(skillId)) return;
    e.preventDefault();
    if (dropTarget) setOrder(reorder(linkedIds, draggedId, dropTarget.id, dropTarget.position));
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: linkedIds.length, total: (skills ?? []).length })}
        </span>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>
      <div style={s.filterRow}>
        <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
      </div>

      {sorted.length === 0 ? (
        <div style={s.empty}>{t("skills.empty")}</div>
      ) : (
        <div style={s.list}>
          {sorted.map((sk) => {
            const attached = orderIndex.has(sk.id);
            const idx = orderIndex.get(sk.id);
            const color = TYPE_COLOR[sk.type] ?? "var(--text-secondary)";
            const isDragging = draggedId === sk.id;
            const isDropTarget = attached && dropTarget?.id === sk.id;
            return (
              <div
                key={sk.id}
                style={s.row(isDragging, isDropTarget ? dropTarget!.position : null)}
                onDragOver={(e) => handleDragOver(e, sk.id)}
                onDrop={(e) => handleDrop(e, sk.id)}
              >
                {attached ? (
                  <span
                    style={s.dragHandle}
                    draggable
                    onDragStart={(e) => handleDragStart(e, sk.id)}
                    onDragEnd={handleDragEnd}
                    aria-label="Drag to reorder"
                  >
                    <Icon.GripVertical size={14} />
                  </span>
                ) : (
                  <span style={s.dragHandleSpacer} />
                )}
                <Checkbox checked={attached} onChange={(v) => toggle(sk.id, v)} />
                <span style={s.name}>{sk.name}</span>
                <span className="mono" style={s.typeChip(color)}>
                  {sk.type}
                </span>
                {attached && (
                  <div style={s.moveBtns}>
                    <button
                      style={s.moveBtn(idx === 0)}
                      disabled={idx === 0}
                      onClick={() => move(sk.id, -1)}
                      aria-label="Move up"
                    >
                      <Icon.ArrowUp size={14} />
                    </button>
                    <button
                      style={s.moveBtn(idx === linkedIds.length - 1)}
                      disabled={idx === linkedIds.length - 1}
                      onClick={() => move(sk.id, 1)}
                      aria-label="Move down"
                    >
                      <Icon.ArrowDown size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
