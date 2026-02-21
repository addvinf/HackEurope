"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Config } from "@/lib/types";
import { RulesForm } from "@/components/rules-form";

export default function RulesPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        setConfig(data);
      } else {
        // Create default config
        const { data: newConfig } = await supabase
          .from("configs")
          .insert({ user_id: user.id })
          .select()
          .single();
        if (newConfig) setConfig(newConfig);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(updated: Partial<Config>) {
    if (!config) return;
    setSaving(true);
    setSaved(false);

    const { data } = await supabase
      .from("configs")
      .update({ ...updated, updated_at: new Date().toISOString() })
      .eq("id", config.id)
      .select()
      .single();

    if (data) {
      setConfig(data);
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

      {config ? (
        <RulesForm config={config} onSave={handleSave} saving={saving} />
      ) : (
        <p className="text-[#86868b]">Unable to load configuration.</p>
      )}
    </div>
  );
}
