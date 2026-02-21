"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const allNavItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/setup", label: "Setup", setupOnly: true },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/approvals", label: "Approvals" },
  { href: "/dashboard/pair", label: "Pair" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [setupDone, setSetupDone] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    async function checkSetup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("configs")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      const done = !!data;
      setSetupDone(done);

      // New user without config → redirect to setup (unless already there)
      if (!done && !pathname.startsWith("/dashboard/setup")) {
        router.replace("/dashboard/setup");
      }
    }
    checkSetup();
  }, [pathname]);

  // Hide "Setup" nav item once the user has completed setup
  const navItems = setupDone
    ? allNavItems.filter((item) => !item.setupOnly)
    : allNavItems;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Show nothing while checking setup status to avoid flash
  if (setupDone === null) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-[#86868b]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <nav className="bg-white/80 backdrop-blur-xl border-b border-black/[0.06] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
              ClawPay
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? "bg-[#0071e3] text-white"
                        : "text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
