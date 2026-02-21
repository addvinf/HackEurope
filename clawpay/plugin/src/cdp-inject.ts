import type { VirtualCardDetails } from "./types.js";

/**
 * CDP (Chrome DevTools Protocol) card injection.
 *
 * This module fills payment card details into a checkout form using CDP
 * Runtime.evaluate — the card number goes directly from the plugin process
 * to the browser at the protocol level. The LLM never sees the card data.
 *
 * How it works:
 *   1. The purchase tool gets approved → receives a card_id
 *   2. The plugin fetches full card details from /api/card-details
 *   3. This module builds a CDP Runtime.evaluate call that:
 *      - Finds the payment form fields by common selectors
 *      - Sets the values directly on the DOM elements
 *      - Dispatches input/change events so React/Vue/etc. pick up the changes
 *   4. The LLM only sees "payment fields filled successfully" — never the numbers
 *
 * In production, the CDP session comes from OpenClaw's browser tool.
 * For the mock, we return the CDP command payload so the agent tool
 * can execute it through OpenClaw's existing browser infrastructure.
 */

/**
 * Common CSS selectors for checkout form fields.
 * Covers most major e-commerce platforms.
 */
const FIELD_SELECTORS = {
  number: [
    'input[name="cardnumber"]',
    'input[name="card-number"]',
    'input[name="cardNumber"]',
    'input[name="cc-number"]',
    'input[autocomplete="cc-number"]',
    'input[data-elements-stable-field-name="cardNumber"]',
    "#card-number",
    "#cardNumber",
    ".card-number input",
  ],
  expMonth: [
    'input[name="exp-month"]',
    'input[name="expMonth"]',
    'input[autocomplete="cc-exp-month"]',
    'select[name="exp-month"]',
    'select[name="expMonth"]',
    "#exp-month",
  ],
  expYear: [
    'input[name="exp-year"]',
    'input[name="expYear"]',
    'input[autocomplete="cc-exp-year"]',
    'select[name="exp-year"]',
    'select[name="expYear"]',
    "#exp-year",
  ],
  expiry: [
    'input[name="expiry"]',
    'input[name="exp-date"]',
    'input[name="cardExpiry"]',
    'input[autocomplete="cc-exp"]',
    "#card-expiry",
  ],
  cvc: [
    'input[name="cvc"]',
    'input[name="cvv"]',
    'input[name="csc"]',
    'input[name="cardCvc"]',
    'input[autocomplete="cc-csc"]',
    "#card-cvc",
    "#cvv",
  ],
};

function buildSelectorChain(selectors: string[]): string {
  return selectors.map((s) => `document.querySelector('${s}')`).join(" || ");
}

/**
 * Generate a CDP Runtime.evaluate expression that fills card details
 * into the checkout form. The expression is self-contained JavaScript
 * that runs in the page context.
 *
 * SECURITY: This string contains the real card number. It must be sent
 * directly to CDP and NEVER logged, returned to the LLM, or stored.
 */
export function buildCdpFillExpression(card: VirtualCardDetails): string {
  const expiry = `${card.exp_month}/${card.exp_year.slice(-2)}`;

  // The expression finds each field, sets its value, and dispatches events
  return `
(function() {
  function fill(el, value) {
    if (!el) return false;
    var nativeSet = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value'
    )?.set;
    if (nativeSet) nativeSet.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  var results = {};

  var numberEl = ${buildSelectorChain(FIELD_SELECTORS.number)};
  results.number = fill(numberEl, '${card.number}');

  var expiryEl = ${buildSelectorChain(FIELD_SELECTORS.expiry)};
  if (expiryEl) {
    results.expiry = fill(expiryEl, '${expiry}');
  } else {
    var monthEl = ${buildSelectorChain(FIELD_SELECTORS.expMonth)};
    var yearEl = ${buildSelectorChain(FIELD_SELECTORS.expYear)};
    results.expMonth = fill(monthEl, '${card.exp_month}');
    results.expYear = fill(yearEl, '${card.exp_year}');
  }

  var cvcEl = ${buildSelectorChain(FIELD_SELECTORS.cvc)};
  results.cvc = fill(cvcEl, '${card.cvc}');

  return JSON.stringify(results);
})()
`.trim();
}

/**
 * Build the CDP command payload for injection.
 *
 * Returns an object the plugin can pass to OpenClaw's browser tool
 * to execute. The plugin never needs to parse or inspect the expression.
 */
export function buildCdpInjectionPayload(card: VirtualCardDetails): {
  /** The CDP method to call */
  method: "Runtime.evaluate";
  /** The CDP params */
  params: {
    expression: string;
    returnByValue: true;
  };
  /** Safe summary for the LLM (no card data) */
  summary: string;
} {
  return {
    method: "Runtime.evaluate",
    params: {
      expression: buildCdpFillExpression(card),
      returnByValue: true,
    },
    summary: `Payment details filled into checkout form (virtual card ending ${card.number.slice(-4)}, limit $${card.spending_limit} ${card.currency})`,
  };
}
