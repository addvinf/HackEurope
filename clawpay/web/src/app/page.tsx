"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CardPreview } from "@/components/card-preview";

/* ── Scroll-reveal hook ─────────────────────────────────── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ── Count-up hook (triggers once on IntersectionObserver) ─ */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasRun.current) {
          hasRun.current = true;
          obs.disconnect();
          const start = performance.now();
          const step = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(eased * target));
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);

  return { ref, value };
}

/* ── Reusable section wrapper ───────────────────────────── */
function Section({
  children,
  className = "",
  id,
  revealClass = "scroll-reveal",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  revealClass?: string;
}) {
  const ref = useScrollReveal();
  return (
    <section id={id} className={className}>
      <div ref={ref} className={`${revealClass} max-w-6xl mx-auto px-6 py-24 sm:py-32`}>
        {children}
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [navVisible, setNavVisible] = useState(false);

  /* Sticky nav: show when hero scrolls out of view */
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => setNavVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]">
      {/* ── 0. Sticky Nav ───────────────────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          navVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        } bg-white/80 backdrop-blur-xl border-b border-black/5`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <img src="/clawbotlogo.png" alt="ClawPay" className="h-7" />
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-[#1d1d1f] hover:text-[#0071e3] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium bg-[#0071e3] text-white px-5 py-2 rounded-full hover:bg-[#0077ed] transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── 1. Hero ─────────────────────────────────────── */}
      <div
        ref={heroRef}
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative"
      >
        <h1
          className="text-5xl sm:text-7xl lg:text-8xl font-semibold tracking-tight max-w-4xl leading-[1.05]"
          style={{ animation: "heroFadeInUp 0.8s ease-out both" }}
        >
          Payment guardrails
          <br />
          for{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #0071e3, #34c759, #0071e3)",
              backgroundSize: "200% 100%",
              animation: "gradientShimmer 4s ease infinite",
            }}
          >
            AI agents
          </span>
        </h1>

        <p
          className="mt-6 text-lg sm:text-xl text-[#86868b] max-w-xl leading-relaxed"
          style={{ animation: "heroFadeInUp 0.8s ease-out 0.15s both" }}
        >
          Set spending limits, approve purchases in real time, and monitor every
          transaction your autonomous agent makes.
        </p>

        <div
          className="flex flex-wrap justify-center gap-4 mt-8"
          style={{ animation: "heroFadeInUp 0.8s ease-out 0.3s both" }}
        >
          <Link
            href="/login"
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white font-medium px-8 py-3 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started
          </Link>
          <button
            onClick={() =>
              document
                .getElementById("virtual-card")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="border border-[#86868b]/30 text-[#1d1d1f] font-medium px-8 py-3 rounded-full transition-all hover:border-[#0071e3] hover:text-[#0071e3] hover:scale-[1.02] active:scale-[0.98]"
          >
            See how it works
          </button>
        </div>

        {/* Scroll chevron */}
        <div
          className="absolute bottom-10"
          style={{ animation: "scrollBounce 2s ease-in-out infinite" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#86868b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* ── 1.5. Quick Install ──────────────────────────── */}
      <InstallSection />

      {/* ── 2. Virtual Card ─────────────────────────────── */}
      <Section
        id="virtual-card"
        className="bg-[#1d1d1f] text-white"
      >
        <div className="flex flex-col items-center text-center">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            A wallet built for agents.
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-lg">
            Issue virtual Visa cards instantly. Each agent gets its own card
            with built-in spending controls.
          </p>

          <div
            className="mt-12 w-full max-w-sm"
            style={{ animation: "cardFloat 6s ease-in-out infinite" }}
          >
            <CardPreview
              last4="4242"
              brand="visa"
              name="OpenClaw Agent"
              expMonth="12"
              expYear="27"
            />
          </div>

          <div className="flex flex-wrap justify-center gap-6 mt-12">
            {[
              ["$0.00", "Fraud losses"],
              ["< 1s", "Card issuance"],
              ["24/7", "Monitoring"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="bg-white/10 rounded-2xl px-6 py-4 backdrop-blur-sm"
              >
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-sm text-[#86868b] mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 3. Spending Limits ──────────────────────────── */}
      <SpendingLimitsSection />

      {/* ── 4. Smart Approvals ──────────────────────────── */}
      <Section className="bg-white">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Approve from anywhere.
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-lg mx-auto">
            Get real-time purchase requests via Telegram, WhatsApp, or the web
            dashboard. Tap to approve or deny.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
          {/* Pending card */}
          <div
            className="bg-[#f5f5f7] rounded-3xl p-6 relative"
            style={{ animation: "glowPulse 2.5s ease-in-out infinite" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#ff9f0a] animate-pulse" />
              <span className="text-xs font-medium text-[#ff9f0a] uppercase tracking-wide">
                Pending
              </span>
            </div>
            <div className="text-sm text-[#86868b]">OpenClaw Agent</div>
            <div className="text-lg font-semibold mt-1">
              AWS EC2 Instance &mdash; $24.99
            </div>
            <div className="flex gap-3 mt-5">
              <div className="flex-1 text-center py-2.5 rounded-xl bg-[#34c759] text-white text-sm font-medium">
                Approve
              </div>
              <div className="flex-1 text-center py-2.5 rounded-xl bg-[#ff3b30] text-white text-sm font-medium">
                Deny
              </div>
            </div>
          </div>

          {/* Approved card */}
          <div className="bg-[#f5f5f7] rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34c759"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs font-medium text-[#34c759] uppercase tracking-wide">
                Approved
              </span>
            </div>
            <div className="text-sm text-[#86868b]">OpenClaw Agent</div>
            <div className="text-lg font-semibold mt-1">
              GitHub Copilot &mdash; $19.00
            </div>
            <div className="mt-5 text-center py-2.5 rounded-xl bg-[#34c759]/10 text-[#34c759] text-sm font-medium">
              Approved 2 min ago
            </div>
          </div>
        </div>

        {/* Channel icons */}
        <div className="flex justify-center gap-8 mt-14">
          {[
            {
              name: "Telegram",
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#0088cc">
                  <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 7.18l-1.97 9.3c-.15.67-.54.83-1.1.52l-3.03-2.24-1.46 1.41c-.16.16-.3.3-.61.3l.22-3.07 5.57-5.03c.24-.22-.05-.33-.38-.13l-6.88 4.34-2.96-.93c-.65-.2-.66-.65.13-.96l11.57-4.46c.54-.2 1.01.13.83.96z" />
                </svg>
              ),
            },
            {
              name: "WhatsApp",
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#25d366">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 2.12.55 4.11 1.51 5.84L0 24l6.33-1.66A11.95 11.95 0 0012 24c6.63 0 12-5.37 12-12S18.63 0 12 0zm5.95 16.97c-.25.7-1.47 1.35-2.03 1.43-.54.08-1.22.11-1.97-.12a17.65 17.65 0 01-1.78-.66c-3.14-1.36-5.19-4.53-5.35-4.74-.15-.21-1.25-1.67-1.25-3.18s.79-2.26 1.07-2.57c.28-.31.62-.39.83-.39.21 0 .41 0 .59.01.19.01.45-.07.7.53.25.62.87 2.13.95 2.28.08.15.13.33.02.53-.1.2-.16.33-.31.5-.15.18-.32.39-.46.53-.15.15-.31.31-.13.6.18.3.78 1.29 1.68 2.09 1.15.97 2.12 1.27 2.42 1.41.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.39-.25.66-.15.27.1 1.7.8 1.99.95.3.15.49.22.56.34.08.12.08.7-.17 1.4z" />
                </svg>
              ),
            },
            {
              name: "Web",
              icon: (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0071e3"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              ),
            },
          ].map((ch) => (
            <div key={ch.name} className="flex flex-col items-center gap-2">
              {ch.icon}
              <span className="text-xs text-[#86868b]">{ch.name}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 5. Safety Guardrails ────────────────────────── */}
      <Section className="bg-[#1d1d1f] text-white" revealClass="scroll-reveal-scale">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Safety by default.
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-lg mx-auto">
            Flip a switch to block merchants, restrict international purchases,
            or pause spending overnight.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34c759"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              ),
              title: "Block merchants",
              desc: "Blacklist specific merchants or entire categories to keep spending on track.",
            },
            {
              icon: (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34c759"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              ),
              title: "Block international",
              desc: "Restrict transactions to domestic-only to reduce fraud exposure.",
            },
            {
              icon: (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34c759"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              ),
              title: "Night pause",
              desc: "Automatically freeze the card outside business hours.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-white/5 border border-white/10 rounded-3xl p-6"
            >
              <div className="mb-4">{card.icon}</div>
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="text-sm text-[#86868b] mt-2 leading-relaxed">
                {card.desc}
              </p>
              {/* Static toggle */}
              <div className="mt-5 w-12 h-7 rounded-full bg-[#34c759] flex items-center justify-end px-0.5">
                <div className="w-6 h-6 rounded-full bg-white shadow" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 6. Real-Time Monitoring ─────────────────────── */}
      <MonitoringSection />

      {/* ── 7. Stripe Deposits ──────────────────────────── */}
      <StripeSection />

      {/* ── 8. Final CTA ────────────────────────────────── */}
      <Section className="bg-gradient-to-b from-[#1d1d1f] to-black text-white">
        <div className="text-center py-12">
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight">
            Ready to take control?
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-md mx-auto">
            Give your AI agents the freedom to act &mdash; with the guardrails
            to keep you safe.
          </p>
          <Link
            href="/login"
            className="inline-block mt-10 bg-white text-[#1d1d1f] font-semibold px-10 py-4 rounded-full text-lg hover:scale-[1.03] active:scale-[0.98] transition-transform"
          >
            Get started
          </Link>
          <div className="mt-6">
            <Link
              href="/login"
              className="text-sm text-[#86868b] hover:text-white transition-colors"
            >
              Already have an account?{" "}
              <span className="underline">Sign in</span>
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="bg-black text-center text-[#86868b] text-sm py-8 px-6">
        <div className="max-w-6xl mx-auto">
          ClawPay &mdash; payment guardrails for autonomous agents
          <br />
          <span className="text-xs text-[#48484a]">
            &copy; {new Date().getFullYear()} ClawPay. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ── Quick Install section ─────────────────────────────── */
function InstallSection() {
  const [copied, setCopied] = useState(false);
  const command = "curl -fsSL https://clawpay.tech/install | bash";

  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section className="bg-[#f5f5f7]">
      <div className="flex flex-col items-center text-center">
        <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          One command to install.
        </h2>
        <p className="mt-4 text-[#86868b] text-lg max-w-lg">
          The fastest way to add ClawPay to your OpenClaw setup.{" "}
          <Link href="/login" className="text-[#0071e3] hover:underline">
            Create an account
          </Link>{" "}
          to get your pairing code, then paste this in your terminal.
        </p>

        <div className="mt-10 w-full max-w-2xl">
          <div className="bg-[#1d1d1f] rounded-2xl p-1">
            {/* Terminal chrome */}
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs text-[#86868b]">Terminal</span>
            </div>

            {/* Command */}
            <div className="flex items-center justify-between bg-[#2d2d2f] rounded-xl mx-2 mb-2 px-5 py-4">
              <code className="text-sm sm:text-base text-[#f5f5f7] font-mono truncate mr-4">
                <span className="text-[#34c759]">$</span>{" "}
                {command}
              </code>
              <button
                onClick={copy}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all bg-white/10 hover:bg-white/20 text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-[#86868b]">
            Then pass your 6-digit pairing code:{" "}
            <code className="bg-[#e5e5ea] text-[#1d1d1f] px-2 py-0.5 rounded text-xs font-mono">
              curl -fsSL https://clawpay.tech/install | bash -s -- 483291
            </code>
          </p>
        </div>

        {/* Steps */}
        <div className="grid sm:grid-cols-3 gap-6 mt-14 w-full max-w-2xl text-left">
          {[
            {
              step: "1",
              title: "Install",
              desc: "Clones the plugin and registers it with OpenClaw.",
            },
            {
              step: "2",
              title: "Pair",
              desc: "Links your agent to your ClawPay dashboard with a 6-digit code.",
            },
            {
              step: "3",
              title: "Done",
              desc: "Restart OpenClaw and your agent has payment guardrails.",
            },
          ].map((s) => (
            <div key={s.step} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#0071e3] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                {s.step}
              </div>
              <div>
                <div className="font-semibold text-[#1d1d1f]">{s.title}</div>
                <div className="text-sm text-[#86868b] mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ── Animated limit slider ──────────────────────────────── */
function AnimatedSlider({
  label,
  target,
  max,
  delay,
}: {
  label: string;
  target: number;
  max: number;
  delay: number;
}) {
  const { ref, value } = useCountUp(target, 1200 + delay);
  const pct = (value / max) * 100;

  return (
    <div ref={ref} className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-[#1d1d1f]">{label}</span>
        <span className="font-semibold text-[#0071e3] tabular-nums">
          ${value}
        </span>
      </div>
      <div className="h-1.5 bg-[#e5e5ea] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0071e3] rounded-full transition-[width] duration-75 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Spending Limits section (needs its own hooks) ──────── */
function SpendingLimitsSection() {
  const leftRef = useScrollReveal();
  const rightRef = useScrollReveal();

  return (
    <section className="bg-[#f5f5f7]">
      <div className="max-w-6xl mx-auto px-6 py-24 sm:py-32 grid md:grid-cols-2 gap-16 items-center">
        <div ref={leftRef} className="scroll-reveal-left">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Granular spending limits.
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-md">
            Set per-purchase, daily, and monthly caps. Your agent operates
            freely within bounds you define.
          </p>
        </div>

        <div ref={rightRef} className="scroll-reveal-right space-y-6">
          <AnimatedSlider label="Per purchase" target={50} max={200} delay={0} />
          <AnimatedSlider label="Daily limit" target={150} max={500} delay={150} />
          <AnimatedSlider label="Monthly limit" target={500} max={2000} delay={300} />
        </div>
      </div>
    </section>
  );
}

/* ── Monitoring section (needs its own hooks) ───────────── */
function MonitoringSection() {
  const leftRef = useScrollReveal();
  const rightRef = useScrollReveal();

  return (
    <section className="bg-[#f5f5f7]">
      <div className="max-w-6xl mx-auto px-6 py-24 sm:py-32 grid md:grid-cols-2 gap-16 items-center">
        <div ref={leftRef} className="scroll-reveal-left">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Every dollar, accounted for.
          </h2>
          <p className="mt-4 text-[#86868b] text-lg max-w-md">
            Real-time dashboard with transaction history, spending trends, and
            instant alerts.
          </p>
        </div>

        <div ref={rightRef} className="scroll-reveal-right">
          {/* Mini bar chart */}
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="text-sm font-medium text-[#86868b] mb-4">
              Weekly spending
            </div>
            <div className="flex items-end gap-3 h-32">
              {[40, 65, 30, 80, 55, 90, 45].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-lg bg-[#0071e3]"
                  style={{
                    height: `${h}%`,
                    transformOrigin: "bottom",
                    animation: `barGrow 0.8s ease-out ${i * 0.1}s both`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#86868b] mt-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d} className="flex-1 text-center">
                  {d}
                </span>
              ))}
            </div>
          </div>

          {/* Mock transactions */}
          <div className="mt-4 space-y-3">
            {[
              {
                name: "AWS EC2",
                amount: "-$24.99",
                time: "2 min ago",
                color: "#ff9f0a",
              },
              {
                name: "GitHub Copilot",
                amount: "-$19.00",
                time: "1 hr ago",
                color: "#0071e3",
              },
              {
                name: "Vercel Pro",
                amount: "-$20.00",
                time: "3 hr ago",
                color: "#1d1d1f",
              },
            ].map((tx) => (
              <div
                key={tx.name}
                className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: tx.color }}
                  >
                    {tx.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{tx.name}</div>
                    <div className="text-xs text-[#86868b]">{tx.time}</div>
                  </div>
                </div>
                <div className="text-sm font-semibold">{tx.amount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Typewriter hook ────────────────────────────────────── */
function useTypewriter(text: string, speed: number, startDelay: number, trigger: boolean) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!trigger || started.current) return;
    started.current = true;
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [trigger, text, speed, startDelay]);

  return { displayed, done };
}

/* ── Stripe checkout with typewriter ────────────────────── */
function StripeSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [flyAway, setFlyAway] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const email = useTypewriter("john@company.com", 50, 400, visible);
  const card = useTypewriter("4242 4242 4242 4242", 40, 1600, visible);
  const expiry = useTypewriter("12 / 27", 60, 3000, visible);
  const cvc = useTypewriter("424", 80, 3600, visible);

  // Trigger submit after CVC is done
  useEffect(() => {
    if (!cvc.done) return;
    const t = setTimeout(() => setSubmitted(true), 600);
    return () => clearTimeout(t);
  }, [cvc.done]);

  // Fly away after success
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setFlyAway(true), 1200);
    return () => clearTimeout(t);
  }, [submitted]);

  const cursor = (
    <span className="inline-block w-[2px] h-[14px] bg-[#0071e3] ml-[1px] align-middle card-cursor" />
  );

  return (
    <Section className="bg-white">
      <div className="text-center mb-16">
        <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          Fund in seconds.
        </h2>
        <p className="mt-4 text-[#86868b] text-lg max-w-lg mx-auto">
          Add funds via Stripe. Choose a preset or enter a custom amount. Your
          agent&apos;s balance updates instantly.
        </p>
      </div>

      <div
        ref={sectionRef}
        className={`max-w-3xl mx-auto rounded-3xl overflow-hidden shadow-2xl grid sm:grid-cols-2 transition-all duration-[800ms] ease-in ${
          flyAway
            ? "opacity-0 -translate-y-16 scale-95"
            : "opacity-100 translate-y-0 scale-100"
        }`}
      >
        {/* Dark summary side */}
        <div className="bg-[#1d1d1f] text-white p-8 flex flex-col justify-between">
          <div>
            <div className="text-sm text-[#86868b] mb-1">ClawPay</div>
            <div className="text-3xl font-semibold">$100.00</div>
            <div className="text-sm text-[#86868b] mt-4">
              Add funds to wallet
            </div>
          </div>
          <div className="flex gap-3 mt-8">
            {[25, 50, 100, 250].map((amt) => (
              <div
                key={amt}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
                  amt === 100
                    ? "bg-[#0071e3] text-white"
                    : "bg-white/10 text-[#86868b]"
                }`}
              >
                ${amt}
              </div>
            ))}
          </div>
        </div>

        {/* Light form side — typewriter fills */}
        <div className="bg-white p-8">
          <div className="space-y-4">
            {/* Email */}
            <div>
              <div className="text-xs text-[#86868b] mb-1">Email</div>
              <div
                className={`border rounded-lg px-3 py-2.5 text-sm min-h-[38px] transition-colors duration-200 ${
                  visible && !email.done
                    ? "border-[#0071e3] ring-1 ring-[#0071e3]/20"
                    : "border-[#e5e5ea]"
                }`}
              >
                <span className="text-[#1d1d1f]">{email.displayed}</span>
                {visible && !email.done && cursor}
                {!visible && (
                  <span className="text-[#86868b]">agent@company.com</span>
                )}
              </div>
            </div>

            {/* Card number */}
            <div>
              <div className="text-xs text-[#86868b] mb-1">Card information</div>
              <div
                className={`border rounded-lg px-3 py-2.5 text-sm min-h-[38px] transition-colors duration-200 ${
                  email.done && !card.done
                    ? "border-[#0071e3] ring-1 ring-[#0071e3]/20"
                    : "border-[#e5e5ea]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[#1d1d1f] tabular-nums">{card.displayed}</span>
                    {email.done && !card.done && cursor}
                  </div>
                  {/* Visa logo fades in after first 4 digits */}
                  <svg
                    width="36"
                    height="12"
                    viewBox="0 0 780 500"
                    className={`shrink-0 transition-opacity duration-300 ${
                      card.displayed.length >= 4 ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <path d="M293.2 348.73l33.36-195.76h53.35l-33.38 195.76zm246.11-191.54c-10.57-3.97-27.16-8.2-47.89-8.2-52.84 0-90.08 26.58-90.33 64.64-.5 28.12 26.53 43.81 46.76 53.17 20.73 9.59 27.69 15.72 27.69 24.28-.25 13.1-16.61 19.11-31.96 19.11-21.36 0-32.69-2.96-50.22-10.27l-6.88-3.11-7.49 43.81c12.46 5.47 35.54 10.2 59.47 10.45 56.18 0 92.67-26.21 93.05-66.9.25-22.3-14.07-39.27-44.95-53.3-18.72-9.08-30.19-15.15-30.19-24.39.25-8.33 9.72-16.91 30.82-16.91 17.6-.25 30.31 3.58 40.28 7.55l4.82 2.24 7.01-41.87zm137.31-4.22h-41.27c-12.77 0-22.36 3.46-27.94 16.16l-79.24 179.59h56.06s9.16-24.14 11.23-29.43l68.33.08c1.6 6.86 6.5 29.35 6.5 29.35h49.56l-43.23-195.75zM639.03 299c4.4-11.27 21.36-54.67 21.36-54.67-.25.5 4.4-11.39 7.11-18.76l3.63 16.97s10.27 46.88 12.4 56.72h-44.5zM259.65 152.97L207.06 285.5l-5.6-27.19c-9.72-31.21-40.03-65.02-73.98-81.94l47.77 171.98h56.55l84.12-195.38h-56.27" fill="#1a1f71" />
                    <path d="M146.92 152.97H60.88l-.62 3.46c67.08 16.22 111.48 55.41 129.83 102.47L171.82 169.5c-3.15-12.08-12.58-16.03-24.9-16.53" fill="#f9a533" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Expiry + CVC */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`border rounded-lg px-3 py-2.5 text-sm min-h-[38px] transition-colors duration-200 ${
                  card.done && !expiry.done
                    ? "border-[#0071e3] ring-1 ring-[#0071e3]/20"
                    : "border-[#e5e5ea]"
                }`}
              >
                <span className="text-[#1d1d1f] tabular-nums">{expiry.displayed}</span>
                {card.done && !expiry.done && cursor}
              </div>
              <div
                className={`border rounded-lg px-3 py-2.5 text-sm min-h-[38px] transition-colors duration-200 ${
                  expiry.done && !cvc.done
                    ? "border-[#0071e3] ring-1 ring-[#0071e3]/20"
                    : "border-[#e5e5ea]"
                }`}
              >
                <span className="text-[#1d1d1f] tabular-nums">{cvc.displayed}</span>
                {expiry.done && !cvc.done && cursor}
              </div>
            </div>

            {/* Pay button */}
            <div
              className={`w-full rounded-lg py-3 font-medium text-sm text-center transition-all duration-500 ${
                submitted
                  ? "bg-[#34c759] text-white scale-[1.02]"
                  : "bg-[#0071e3] text-white"
              }`}
            >
              {submitted ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Payment successful
                </span>
              ) : (
                "Pay $100.00"
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-[#86868b]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#86868b">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
            </svg>
            Powered by Stripe
          </div>
        </div>
      </div>
    </Section>
  );
}
