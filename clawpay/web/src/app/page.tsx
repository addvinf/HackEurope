import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto w-full">
        <span className="text-xl font-semibold tracking-tight">ClawPay</span>
        <Link
          href="/login"
          className="text-sm font-medium text-[#0071e3] hover:text-[#0077ed] transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight max-w-3xl leading-[1.05]">
          Secure payments
          <br />
          for your{" "}
          <span className="bg-gradient-to-r from-[#0071e3] to-[#34c759] bg-clip-text text-transparent">
            AI agent
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-[#86868b] max-w-xl leading-relaxed">
          Set spending limits, approve purchases, and monitor every transaction
          your OpenClaw agent makes &mdash; all from one dashboard.
        </p>
        <div className="flex gap-4 mt-4">
          <Link
            href="/login"
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white font-medium px-8 py-3 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started
          </Link>
          <Link
            href="/dashboard"
            className="bg-transparent border border-[#0071e3] text-[#0071e3] font-medium px-8 py-3 rounded-full transition-all hover:bg-[#0071e3]/5 hover:scale-[1.02] active:scale-[0.98]"
          >
            Dashboard
          </Link>
        </div>
      </main>

      <footer className="text-center text-[#86868b] text-sm py-8">
        ClawPay &mdash; payment guardrails for autonomous agents
      </footer>
    </div>
  );
}
