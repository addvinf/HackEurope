"use client";

import { useEffect, useState } from "react";

interface PairingCodeDisplayProps {
  code: string;
  expiresAt: string;
}

export function PairingCodeDisplay({ code, expiresAt }: PairingCodeDisplayProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    function update() {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(diff);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expired = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] py-10 px-6">
        <p
          className={`font-mono text-5xl tracking-[0.4em] font-semibold ${
            expired ? "text-[#aeaeb2]" : "text-[#1d1d1f]"
          }`}
        >
          {code}
        </p>
      </div>
      <p
        className={`text-sm font-medium ${
          expired ? "text-[#ff3b30]" : "text-[#86868b]"
        }`}
      >
        {expired
          ? "Code expired. Generate a new one."
          : `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`}
      </p>
    </div>
  );
}
