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
  onFieldChange: (field: CardField, value: string) => void;
  onFieldFocus: (field: CardField) => void;
  onAdvanceField: () => void;
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
  const groups = digits.match(/.{1,4}/g) || [];
  const filled = groups.join(" ");
  if (digits.length < 16) {
    const remaining = 16 - digits.length;
    const placeholder = "\u2022".repeat(remaining);
    const placeholderGroups = placeholder.match(/.{1,4}/g) || [];
    // merge last partial group
    if (groups.length > 0 && digits.length % 4 !== 0) {
      const lastGroupLen = groups[groups.length - 1].length;
      const pad = 4 - lastGroupLen;
      return filled + "\u2022".repeat(pad) + (placeholderGroups.length > (pad > 0 ? 0 : 0) ? " " + placeholderGroups.slice(pad > 0 ? 1 : 0).join(" ") : "");
    }
    return filled + (filled ? " " : "") + placeholderGroups.join(" ");
  }
  return filled;
}

function formatDisplayNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022";
  return formatCardNumber(raw);
}

const fieldLabels: Record<CardField, string> = {
  number: "Card number",
  name: "Name on card",
  expiry: "Expiry (MM/YY)",
  cvc: "CVC",
};

export function CardPreview(props: CardPreviewProps) {
  const { brand, interactive } = props;
  const gradient = brandColors[brand] || brandColors.unknown;
  const logo = brandLogos[brand] || "";
  const isFlipped = interactive && props.activeField === "cvc";

  const numberRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!interactive) return;
    const ref = { number: numberRef, name: nameRef, expiry: expiryRef, cvc: cvcRef }[props.activeField || "number"];
    ref?.current?.focus();
  }, [interactive, interactive ? props.activeField : null]);

  if (!interactive) {
    // Original display-only card
    const { last4, name, expMonth, expYear } = props;
    return (
      <div
        className={`w-full aspect-[1.586/1] max-w-sm bg-gradient-to-br ${gradient} rounded-2xl p-6 flex flex-col justify-between text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]`}
      >
        <div className="flex justify-between items-start">
          <span className="text-xs uppercase tracking-widest opacity-60 font-medium">ClawPay</span>
          <span className="text-lg font-semibold tracking-wider">{logo}</span>
        </div>
        <div>
          <p className="font-mono text-xl tracking-[0.2em] mb-4">
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

  // Interactive mode
  const { cardNumber, cvc, activeField, onFieldChange, onFieldFocus, onAdvanceField, name, expMonth, expYear } = props;

  const handleKeyDown = (field: CardField) => (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      onAdvanceField();
    }
  };

  const cursor = <span className="card-cursor text-white/80">|</span>;

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
          className={`font-mono text-xl tracking-[0.12em] mb-4 cursor-text rounded-lg px-2 py-1 -mx-2 transition-all ${activeField === "number" ? "bg-white/10" : "hover:bg-white/5"}`}
          onClick={() => onFieldFocus("number")}
        >
          {formatDisplayNumber(cardNumber)}
          {activeField === "number" && cursor}
          <input
            ref={numberRef}
            type="text"
            inputMode="numeric"
            className="sr-only"
            value={cardNumber}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 16);
              onFieldChange("number", v);
            }}
            onKeyDown={handleKeyDown("number")}
            tabIndex={-1}
            autoComplete="cc-number"
          />
        </div>
        <div className="flex justify-between items-end">
          {/* Name */}
          <div
            className={`cursor-text rounded-lg px-2 py-1 -mx-2 transition-all flex-1 mr-4 ${activeField === "name" ? "bg-white/10" : "hover:bg-white/5"}`}
            onClick={() => onFieldFocus("name")}
          >
            <p className="text-sm uppercase tracking-wider opacity-80">
              {name || "YOUR NAME"}
              {activeField === "name" && cursor}
            </p>
            <input
              ref={nameRef}
              type="text"
              className="sr-only"
              value={name === "YOUR NAME" ? "" : name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              onKeyDown={handleKeyDown("name")}
              tabIndex={-1}
              autoComplete="cc-name"
            />
          </div>
          {/* Expiry */}
          <div
            className={`cursor-text rounded-lg px-2 py-1 transition-all ${activeField === "expiry" ? "bg-white/10" : "hover:bg-white/5"}`}
            onClick={() => onFieldFocus("expiry")}
          >
            <p className="text-sm font-mono opacity-80">
              {expMonth || "MM"}/{expYear || "YY"}
              {activeField === "expiry" && cursor}
            </p>
            <input
              ref={expiryRef}
              type="text"
              inputMode="numeric"
              className="sr-only"
              value={`${expMonth}${expYear}`}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
                onFieldChange("expiry", raw);
              }}
              onKeyDown={handleKeyDown("expiry")}
              tabIndex={-1}
              autoComplete="cc-exp"
            />
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
            {activeField === "cvc" && cursor}
          </span>
          <input
            ref={cvcRef}
            type="text"
            inputMode="numeric"
            className="sr-only"
            value={cvc}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              onFieldChange("cvc", v);
            }}
            onKeyDown={handleKeyDown("cvc")}
            tabIndex={-1}
            autoComplete="cc-csc"
          />
        </div>
      </div>
      <p className="text-xs text-center mt-4 opacity-40">Click anywhere to flip back</p>
    </div>
  );

  return (
    <div>
      <div
        className="card-flip-container w-full max-w-sm cursor-pointer"
        onClick={(e) => {
          // If clicking the back card area and not on CVC, flip back
          if (isFlipped && !(e.target as HTMLElement).closest("input")) {
            onFieldFocus("number");
          }
        }}
      >
        <div className={`card-flip relative w-full aspect-[1.586/1] ${isFlipped ? "flipped" : ""}`}>
          {frontCard}
          {backCard}
        </div>
      </div>
      {/* Active field indicator */}
      {activeField && (
        <p className="text-center text-sm text-[#86868b] mt-3 transition-all">
          {fieldLabels[activeField]}
        </p>
      )}
    </div>
  );
}
