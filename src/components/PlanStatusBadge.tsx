import React from "react";
import { formatIST } from "@/lib/planApi";

/**
 * Plan status badge for admin lists: Draft / Finalized / Scheduled (with the
 * go-live time) / Published (with the publish time).
 */
const STYLES: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 border-yellow-200",
  FINAL: "bg-green-100 text-green-800 border-green-200",
  SCHEDULED: "bg-violet-100 text-violet-800 border-violet-200",
  PUBLISHED: "bg-blue-100 text-blue-800 border-blue-200",
};
const LABELS: Record<string, string> = { DRAFT: "Draft", FINAL: "Finalized", SCHEDULED: "Scheduled", PUBLISHED: "Published" };

interface Props {
  status?: string;
  publishAt?: string | null;
  /** legacy plans: FINAL + isPublished */
  isPublished?: boolean;
  showTime?: boolean;
}

const PlanStatusBadge: React.FC<Props> = ({ status = "DRAFT", publishAt, isPublished, showTime = true }) => {
  const effective = status === "FINAL" && isPublished ? "PUBLISHED" : status;
  const scheduledButLive = effective === "SCHEDULED" && publishAt && new Date(publishAt) <= new Date();
  const shown = scheduledButLive ? "PUBLISHED" : effective;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className={`px-2 py-0.5 rounded border text-xs font-bold ${STYLES[shown] || STYLES.DRAFT}`}>
        {LABELS[shown] || shown}
      </span>
      {showTime && publishAt && (shown === "SCHEDULED" || shown === "PUBLISHED") && (
        <span className="text-[10px] text-slate-500 whitespace-nowrap">
          {shown === "SCHEDULED" ? "Goes live " : "Live since "}{formatIST(publishAt)}
        </span>
      )}
    </span>
  );
};

export default PlanStatusBadge;
