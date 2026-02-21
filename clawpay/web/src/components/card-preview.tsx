"use client";

import { useRef, useEffect } from "react";

type CardField = "number" | "name" | "expiry" | "cvc";

interface CardPreviewBaseProps {
  last4: string;
  brand: string;
  name: string;
  expMonth: string;
  expYear: string;
}

interface CardPreviewDisplayProps extends CardPreviewBaseProps {
  interactive?: false;
}

interface CardPreviewInteractiveProps extends CardPreviewBaseProps {
  interactive: true;
  cardNumber: string;
  cvc: string;
  activeField: CardField | null;
}

type CardPreviewProps = CardPreviewDisplayProps | CardPreviewInteractiveProps;

const brandColors: Record<string, string> = {
  visa: "from-[#1a1a2e] to-[#16213e]",
  mastercard: "from-[#2d1b69] to-[#11001c]",
  amex: "from-[#1b2838] to-[#0d1b2a]",
  discover: "from-[#2a1a0a] to-[#1a0a00]",
  unknown: "from-[#2c2c2e] to-[#1c1c1e]",
};

const brandLogos: Record<string, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
  unknown: "",
};

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  const padded = digits.padEnd(16, "\u2022");
  return padded.match(/.{1,4}/g)!.join(" ");
}

export function CardPreview(props: CardPreviewProps) {
  const { brand, interactive } = props;
  const gradient = brandColors[brand] || brandColors.unknown;
  const logo = brandLogos[brand] || "";
  const isFlipped = interactive && props.activeField === "cvc";

  if (!interactive) {
    // Display-only card
    const { last4, name, expMonth, expYear } = props;
    return (
      <div
        className={`w-full aspect-[1.586/1] max-w-md bg-gradient-to-br ${gradient} rounded-2xl p-6 flex flex-col justify-between text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]`}
      >
        <div className="flex justify-between items-start">
          <span className="text-xs uppercase tracking-widest opacity-60 font-medium">ClawPay</span>
          <span className="text-lg font-semibold tracking-wider">{logo}</span>
        </div>
        <div>
          <p className="font-mono text-lg tracking-[0.15em] mb-4">
            &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; {last4}
          </p>
          <div className="flex justify-between items-end">
            <p className="text-sm uppercase tracking-wider opacity-80">{name}</p>
            <p className="text-sm font-mono opacity-80">
              {expMonth}/{expYear}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Interactive preview (read-only card with highlight)
  const { cardNumber, cvc, activeField, name, expMonth, expYear } = props;

  const frontCard = (
    <div
      className={`card-flip-front absolute inset-0 w-full h-full bg-gradient-to-br ${gradient} rounded-2xl p-6 flex flex-col justify-between text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]`}
    >
      <div className="flex justify-between items-start">
        <span className="text-xs uppercase tracking-widest opacity-60 font-medium">ClawPay</span>
        <span className="text-lg font-semibold tracking-wider">{logo}</span>
      </div>
      <div>
        {/* Card number */}
        <div
          className={`font-mono text-lg tracking-[0.15em] mb-4 rounded-lg px-2 py-1 -mx-2 transition-all ${activeField === "number" ? "bg-white/10" : ""}`}
        >
          {formatCardNumber(cardNumber)}
        </div>
        <div className="flex justify-between items-end">
          {/* Name */}
          <div
            className={`rounded-lg px-2 py-1 -mx-2 transition-all flex-1 mr-4 ${activeField === "name" ? "bg-white/10" : ""}`}
          >
            <p className="text-sm uppercase tracking-wider opacity-80">
              {name || "YOUR NAME"}
            </p>
          </div>
          {/* Expiry */}
          <div
            className={`rounded-lg px-2 py-1 transition-all ${activeField === "expiry" ? "bg-white/10" : ""}`}
          >
            <p className="text-sm font-mono opacity-80">
              {expMonth || "MM"}/{expYear || "YY"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const backCard = (
    <div
      className={`card-flip-back absolute inset-0 w-full h-full bg-gradient-to-br ${gradient} rounded-2xl flex flex-col justify-center text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]`}
    >
      {/* Magnetic strip */}
      <div className="w-full h-12 bg-black/40 mb-6" />
      {/* CVC strip */}
      <div className="mx-6 flex items-center">
        <div className="flex-1 h-10 bg-white/20 rounded-lg flex items-center justify-end px-4">
          <span className="font-mono text-lg tracking-widest">
            {cvc || "\u2022\u2022\u2022"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="card-flip-container w-full max-w-md">
      <div className={`card-flip relative w-full aspect-[1.586/1] ${isFlipped ? "flipped" : ""}`}>
        {frontCard}
        {backCard}
      </div>
    </div>
  );
}

/* ── Separate input fields component ── */

interface CardInputFieldsProps {
  cardNumber: string;
  name: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  onFieldChange: (field: CardField, value: string) => void;
  onFieldFocus: (field: CardField) => void;
}

export function CardInputFields({
  cardNumber,
  name,
  expMonth,
  expYear,
  cvc,
  onFieldChange,
  onFieldFocus,
}: CardInputFieldsProps) {
  const numberRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);

  // Auto-advance: card number (16 digits) → name
  useEffect(() => {
    if (cardNumber.replace(/\D/g, "").length >= 16) {
      nameRef.current?.focus();
    }
  }, [cardNumber]);

  // Auto-advance: expiry (4 digits) → CVC
  const expiryRaw = `${expMonth}${expYear}`;
  useEffect(() => {
    if (expiryRaw.replace(/\D/g, "").length >= 4) {
      cvcRef.current?.focus();
    }
  }, [expiryRaw]);

  const inputBase =
    "w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/40 focus:border-[#0071e3] transition-all";

  function formatDisplayNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  function formatExpiry(): string {
    const raw = `${expMonth}${expYear}`;
    if (!raw) return "";
    if (raw.length <= 2) return raw;
    return `${raw.slice(0, 2)}/${raw.slice(2)}`;
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {/* Card number */}
      <div>
        <input
          ref={numberRef}
          type="text"
          inputMode="numeric"
          placeholder="Card number"
          className={inputBase}
          value={formatDisplayNumber(cardNumber)}
          onFocus={() => onFieldFocus("number")}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 16);
            onFieldChange("number", v);
          }}
          autoComplete="cc-number"
        />
      </div>
      {/* Name */}
      <div>
        <input
          ref={nameRef}
          type="text"
          placeholder="Name on card"
          className={inputBase}
          value={name === "YOUR NAME" ? "" : name}
          onFocus={() => onFieldFocus("name")}
          onChange={(e) => onFieldChange("name", e.target.value)}
          autoComplete="cc-name"
        />
      </div>
      {/* Expiry + CVC side by side */}
      <div className="flex gap-3">
        <input
          ref={expiryRef}
          type="text"
          inputMode="numeric"
          placeholder="MM/YY"
          className={`${inputBase} flex-1`}
          value={formatExpiry()}
          onFocus={() => onFieldFocus("expiry")}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
            onFieldChange("expiry", raw);
          }}
          autoComplete="cc-exp"
        />
        <input
          ref={cvcRef}
          type="text"
          inputMode="numeric"
          placeholder="CVC"
          className={`${inputBase} flex-1`}
          value={cvc}
          onFocus={() => onFieldFocus("cvc")}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            onFieldChange("cvc", v);
          }}
          autoComplete="cc-csc"
        />
      </div>
    </div>
  );
}
