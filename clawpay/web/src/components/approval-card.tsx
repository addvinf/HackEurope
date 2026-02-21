"use client";

import type { Approval } from "@/lib/types";

interface ApprovalCardProps {
  approval: Approval;
  onResolve: (id: string, approved: boolean) => void;
}

const statusColors: Record<string, string> = {
  pending: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  approved: "text-[#34c759] bg-[#34c759]/10",
  rejected: "text-[#ff3b30] bg-[#ff3b30]/10",
  expired: "text-[#aeaeb2] bg-black/[0.04]",
};

export function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  const isPending = approval.status === "pending";
  const isExpired =
    isPending && new Date(approval.expires_at) < new Date();

  const statusKey = isExpired ? "expired" : approval.status;
  const statusStyle = statusColors[statusKey] || "text-[#aeaeb2] bg-black/[0.04]";

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium">{approval.item}</p>
          <p className="text-sm text-[#86868b] mt-0.5">
            {approval.merchant} &middot; ${Number(approval.amount).toFixed(2)}{" "}
            {approval.currency}
          </p>
          {approval.risk_flags && approval.risk_flags.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {approval.risk_flags.map((flag) => (
                <span
                  key={flag}
                  className="text-xs bg-[#ff9f0a]/10 text-[#ff9f0a] px-2 py-0.5 rounded-full font-medium"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-[#aeaeb2] mt-2">
            {new Date(approval.created_at).toLocaleString()}
          </p>
        </div>

        <div className="text-right flex flex-col items-end gap-2">
          <span
            className={`text-xs font-medium capitalize px-2.5 py-1 rounded-full ${statusStyle}`}
          >
            {isExpired ? "expired" : approval.status}
          </span>

          {isPending && !isExpired && (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => onResolve(approval.id, true)}
                className="px-4 py-1.5 bg-[#34c759] hover:bg-[#2db84e] text-white text-sm font-medium rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Approve
              </button>
              <button
                onClick={() => onResolve(approval.id, false)}
                className="px-4 py-1.5 bg-[#ff3b30]/10 hover:bg-[#ff3b30]/15 text-[#ff3b30] text-sm font-medium rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
