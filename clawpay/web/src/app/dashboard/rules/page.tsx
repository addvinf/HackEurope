"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Config } from "@/lib/types";
import { RulesForm } from "@/components/rules-form";

function normalizeConfig(config: Config): Config {
  return {
    ...config,
    always_ask: config.always_ask ?? true,
    per_purchase_limit: Number(config.per_purchase_limit ?? 50),
    daily_limit: Number(config.daily_limit ?? 150),
    monthly_limit: Number(config.monthly_limit ?? 500),
    num_purchase_limit: Number(config.num_purchase_limit ?? 25),
    blocked_categories: Array.isArray(config.blocked_categories)
      ? config.blocked_categories
      : [],
    allowed_categories: Array.isArray(config.allowed_categories)
      ? config.allowed_categories
      : [],
    approval_channel: config.approval_channel || "whatsapp",
    approval_timeout_seconds: Number(config.approval_timeout_seconds ?? 300),
    block_new_merchants: config.block_new_merchants ?? true,
    block_international: config.block_international ?? false,
    night_pause: config.night_pause ?? false,
    send_receipts: config.send_receipts ?? true,
    weekly_summary: config.weekly_summary ?? true,
    telegram_chat_id: config.telegram_chat_id ?? null,
  };
}

export default function RulesPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("configs")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setConfig(normalizeConfig(data as Config));
      } else {
        // Create default config
        const { data: newConfig } = await supabase
          .from("configs")
          .insert({ user_id: user.id })
          .select()
          .single();
        if (newConfig) setConfig(normalizeConfig(newConfig as Config));
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(updated: Partial<Config>) {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const { data, error } = await supabase
      .from("configs")
      .update({ ...updated, updated_at: new Date().toISOString() })
      .eq("id", config.id)
      .select()
      .single();

    if (error) {
      const missingColumn =
        error.message.includes("always_ask") ||
        error.message.includes("num_purchase_limit");
      setSaveError(
        missingColumn
          ? "Database is missing new config columns. Run migration 005_config_rule_fields.sql."
          : error.message,
      );
      setSaving(false);
      return;
    }

    if (data) {
      setConfig(normalizeConfig(data as Config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="h-64" />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Spending Rules</h1>
        {saved && (
          <span className="text-[#34c759] text-sm font-medium bg-[#34c759]/10 px-3 py-1 rounded-full">
            Saved
          </span>
        )}
      </div>
      {saveError && (
        <div className="text-sm text-[#ff3b30] bg-[#ff3b30]/10 border border-[#ff3b30]/20 rounded-xl px-4 py-3">
          {saveError}
        </div>
      )}

      {config ? (
        <RulesForm config={config} onSave={handleSave} saving={saving} />
      ) : (
        <p className="text-[#86868b]">Unable to load configuration.</p>
      )}
    </div>
  );
}
