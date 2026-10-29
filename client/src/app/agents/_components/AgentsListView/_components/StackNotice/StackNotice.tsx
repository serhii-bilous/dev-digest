"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RepoStack } from "@devdigest/shared";
import { useRetryRepoStack } from "@/lib/hooks";
import { s } from "./styles";

interface StackNoticeProps {
  repoId: string;
  stack: RepoStack;
  /** Called if the notice unmounts after a retry (so focus can move somewhere sensible). */
  onGone?: () => void;
}

/** Unknown / stale stack notice with Retry. The agent grid keeps rendering. */
export function StackNotice({ repoId, stack, onGone }: StackNoticeProps) {
  const t = useTranslations("agents");
  const retry = useRetryRepoStack();
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const retried = React.useRef(false);
  const onGoneRef = React.useRef(onGone);
  onGoneRef.current = onGone;
  const wasPending = React.useRef(false);

  React.useEffect(() => {
    if (wasPending.current && !retry.isPending) btnRef.current?.focus();
    wasPending.current = retry.isPending;
  }, [retry.isPending]);

  React.useEffect(
    () => () => {
      if (retried.current) onGoneRef.current?.();
    },
    [],
  );

  const reasonKey = stack.reason ?? "unspecified";
  const reason = t(`stack.reasons.${reasonKey}`);
  const text = stack.status === "stale" ? t("stack.staleNotice", { reason }) : t("stack.unknownNotice", { reason });

  return (
    <div role="status" style={s.root}>
      <span style={s.text}>{text}</span>
      <button
        type="button"
        style={s.button(retry.isPending)}
        disabled={retry.isPending}
        aria-busy={retry.isPending}
        ref={btnRef}
        onClick={() => {
          retried.current = true;
          retry.mutate(repoId);
        }}
      >
        {retry.isPending ? t("stack.retrying") : t("stack.retry")}
      </button>
    </div>
  );
}
