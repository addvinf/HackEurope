"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Approval } from "@/lib/types";
import { ApprovalCard } from "@/components/approval-card";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
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

      if (data) setApprovals(data);
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
            setApprovals((prev) => [payload.new as Approval, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setApprovals((prev) =>
              prev.map((a) =>
                a.id === (payload.new as Approval).id
                  ? (payload.new as Approval)
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
    return <div className="flex items-center justify-center h-64 text-[#86868b]">Loading...</div>;
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

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
