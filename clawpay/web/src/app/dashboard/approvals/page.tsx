"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Approval, Transaction } from "@/lib/types";
import { ApprovalCard } from "@/components/approval-card";

type ApprovalListItem = Approval & {
  source?: "approval" | "auto_approved" | "auto_rejected";
};

function approvalKey(entry: {
  item: string;
  merchant: string;
  amount: number | string;
  currency: string;
  category: string | null;
}) {
  return [
    entry.item,
    entry.merchant,
    Number(entry.amount).toFixed(2),
    entry.currency,
    entry.category ?? "",
  ].join("|");
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalListItem[]>([]);
  const [autoApproved, setAutoApproved] = useState<ApprovalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("approvals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const approvalRows = (data || []) as Approval[];
      setApprovals(approvalRows.map((a) => ({ ...a, source: "approval" as const })));

      const approvalSignatureSet = new Set(
        approvalRows.map((a) =>
          approvalKey({
            item: a.item,
            merchant: a.merchant,
            amount: a.amount,
            currency: a.currency,
            category: a.category,
          }),
        ),
      );

      const { data: transactions } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["authorized", "completed", "cancelled", "rejected"])
        .order("created_at", { ascending: false })
        .limit(50);

      const autoApprovedRows = ((transactions || []) as Transaction[])
        .filter((txn) => {
          const key = approvalKey({
            item: txn.item,
            merchant: txn.merchant,
            amount: txn.amount,
            currency: txn.currency,
            category: txn.category,
          });
          return !approvalSignatureSet.has(key);
        })
        .map(
          (txn): ApprovalListItem => ({
            id: `auto-${txn.id}`,
            user_id: txn.user_id,
            token: "",
            item: txn.item,
            amount: Number(txn.amount),
            currency: txn.currency,
            merchant: txn.merchant,
            category: txn.category,
            status: txn.status === "rejected" ? "rejected" : "approved",
            risk_flags:
              txn.status === "rejected"
                ? ["auto_rejected"]
                : ["auto_approved"],
            expires_at: txn.created_at,
            resolved_at: txn.created_at,
            created_at: txn.created_at,
            source:
              txn.status === "rejected"
                ? "auto_rejected"
                : "auto_approved",
          }),
        );
      setAutoApproved(autoApprovedRows);
      setLoading(false);
    }
    load();

    // Real-time subscription
    const channel = supabase
      .channel("approvals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            setApprovals((prev) => [
              { ...(payload.new as Approval), source: "approval" as const },
              ...prev,
            ]);
          } else if (payload.eventType === "UPDATE") {
            setApprovals((prev) =>
              prev.map((a) =>
                a.id === (payload.new as Approval).id
                  ? { ...(payload.new as Approval), source: "approval" as const }
                  : a,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  async function handleResolve(approvalId: string, approved: boolean) {
    const { error } = await supabase
      .from("approvals")
      .update({
        status: approved ? "approved" : "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", approvalId);

    if (!error) {
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === approvalId
            ? {
                ...a,
                status: approved ? "approved" : "rejected",
                resolved_at: new Date().toISOString(),
              }
            : a,
        ),
      );
    }
  }

  if (loading) {
    return <div className="h-64" />;
  }

  const isExpired = (a: ApprovalListItem) =>
    a.status === "pending" && new Date(a.expires_at).getTime() <= nowMs;
  const pending = approvals.filter((a) => a.status === "pending" && !isExpired(a));
  const resolvedApprovals = approvals.filter(
    (a) => a.status !== "pending" || isExpired(a),
  );
  const resolved = [...resolvedApprovals, ...autoApproved].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>

      <div>
        <h2 className="text-xl font-semibold mb-4 tracking-tight">
          Pending{" "}
          <span className="text-[#86868b] font-normal">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-[#86868b]">No pending approvals.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 tracking-tight">History</h2>
        {resolved.length === 0 ? (
          <p className="text-[#86868b]">No past approvals.</p>
        ) : (
          <div className="space-y-3">
            {resolved.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
