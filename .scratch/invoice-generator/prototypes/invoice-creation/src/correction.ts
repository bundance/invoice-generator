// Three correction-flow variants, switchable via `?variant=`, inside the
// approved Document studio's Invoices destination.

type CorrectionVariant = "A" | "B" | "C";

type CorrectionState = {
  variant: CorrectionVariant;
  reason: string;
  showReasonError: boolean;
  confirmCreditOpen: boolean;
  creditIssued: boolean;
  replacementStarted: boolean;
  statusMessage: string;
};

type CorrectionVariantDefinition = {
  key: CorrectionVariant;
  name: string;
  summary: string;
};

const CORRECTION_VARIANTS = [
  {
    key: "A",
    name: "Guided correction",
    summary: "One guarded step at a time, with the outcome explained before each move.",
  },
  {
    key: "B",
    name: "Document chain",
    summary: "The linked records stay visible as the chain grows from left to right.",
  },
  {
    key: "C",
    name: "Audit workspace",
    summary: "A compact record view pairs the chain with a persistent correction drawer.",
  },
] satisfies readonly CorrectionVariantDefinition[];

function parseCorrectionVariant(value: string | null): CorrectionVariant {
  switch (value) {
    case "B":
    case "C":
      return value;
    default:
      return "A";
  }
}

function getAppElement(): HTMLDivElement {
  const element = document.querySelector("#app");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Prototype root element was not found");
  }

  return element;
}

const appElement = getAppElement();

let state: CorrectionState = {
  variant: parseCorrectionVariant(new URL(window.location.href).searchParams.get("variant")),
  reason: "",
  showReasonError: false,
  confirmCreditOpen: false,
  creditIssued: false,
  replacementStarted: false,
  statusMessage: "",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setQueryVariant(variant: CorrectionVariant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  window.history.replaceState({}, "", url);
}

function updateState(nextState: CorrectionState): void {
  state = nextState;
  setQueryVariant(state.variant);
  render();
}

function renderWordmark(): string {
  return '<span class="wordmark" aria-label="Codernetic">coder<span>netic</span></span>';
}

function renderNavigation(): string {
  return `
    <nav class="top-nav" aria-label="Main navigation">
      <a href="/?variant=B&view=new-invoice">New Invoice</a>
      <a class="is-current" href="/?variant=B&view=invoices" aria-current="page">Invoices</a>
      <a href="/?variant=B&view=clients">Clients</a>
      <a href="/?variant=B&view=settings">Settings</a>
    </nav>
  `;
}

function renderAppHeader(): string {
  return `
    <header class="top-bar correction-top-bar">
      <div class="brand-block">${renderWordmark()}<small>Invoice Studio</small></div>
      ${renderNavigation()}
      <button type="button" class="profile-button" aria-label="Open app information">ME</button>
    </header>
  `;
}

function renderOriginalSummary(): string {
  return `
    <article class="record-card record-card--original">
      <header><div><p class="eyebrow">Original invoice</p><h2>GGIOHK-0043</h2></div><span class="status-tag">Issued · unchanged</span></header>
      <dl class="record-facts">
        <div><dt>Client</dt><dd>Genesis Global</dd></div>
        <div><dt>Issued</dt><dd>27 Dec 2025</dd></div>
        <div><dt>Net</dt><dd>$1,450.00</dd></div>
        <div><dt>Total</dt><dd>$1,450.00 USD</dd></div>
      </dl>
      <p class="record-note">This retained invoice and its PDF never change. The credit note is a new linked document.</p>
      <button type="button" class="text-button" data-action="open-original">Open retained PDF</button>
    </article>
  `;
}

function renderReasonField(): string {
  const error = state.showReasonError && state.reason.trim() === "";
  return `
    <label class="field correction-reason" for="correction-reason">
      <span>Correction reason <b aria-hidden="true">Required</b></span>
      <textarea id="correction-reason" name="reason" rows="3" aria-invalid="${String(error)}" aria-describedby="reason-hint${error ? " reason-error" : ""}" placeholder="For example, the billed service period was incorrect.">${escapeHtml(state.reason)}</textarea>
      <small id="reason-hint" class="field-hint">Printed on the credit note. Bad debt is not a correction reason.</small>
      ${error ? '<small id="reason-error" class="field-error">Enter the genuine reason for this correction.</small>' : ""}
    </label>
  `;
}

function renderCreditNotePreview(size: "full" | "compact" = "full"): string {
  return `
    <article class="credit-paper credit-paper--${size}" aria-label="Credit note A4 preview">
      <header><div>${renderWordmark()}<small>CREDIT NOTE</small></div><address><strong>Codernetic Ltd</strong><br />7 Coley Hill<br />Reading RG1 6AE</address></header>
      <section class="credit-paper-meta"><div><span>Credit note</span><strong>CN-GGIOHK-0043</strong></div><div><span>Issue date</span><strong>2 Sep 2026</strong></div></section>
      <section class="credit-paper-client"><span>Credit for</span><strong>Genesis Global</strong><small>References invoice GGIOHK-0043, issued 27 Dec 2025</small></section>
      <table><thead><tr><th>Description</th><th>Days</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td>Full reversal of invoice GGIOHK-0043</td><td>2</td><td>$725.00</td><td>−$1,450.00</td></tr></tbody></table>
      <dl><div><dt>Net credit</dt><dd>−$1,450.00</dd></div><div><dt>VAT</dt><dd>$0.00</dd></div><div><dt>Total credit</dt><dd>−$1,450.00 USD</dd></div></dl>
      <footer><span>Reason</span><strong>${state.reason.trim() === "" ? "Shown here when entered" : escapeHtml(state.reason)}</strong><small>Outside the scope of UK VAT · Original tax facts preserved</small></footer>
    </article>
  `;
}

function renderCreditControls(): string {
  if (state.creditIssued) {
    return `
      <div class="credit-complete" role="status">
        <strong>CN-GGIOHK-0043 issued</strong>
        <span>The original is now fully credited. Both exact PDFs are retained.</span>
      </div>
      <button type="button" class="button button--primary" data-action="start-replacement">${state.replacementStarted ? "Replacement draft opened" : "Create replacement draft"}</button>
    `;
  }

  return `
    ${renderReasonField()}
    <div class="warning-note"><strong>This reverses the whole invoice.</strong> Partial credits are not supported, and the original stays unchanged.</div>
    <button type="button" class="button button--danger" data-action="review-credit">Review and issue credit note</button>
  `;
}

function renderReplacementDraft(): string {
  if (!state.replacementStarted) {
    return '<div class="future-record"><span>3</span><strong>Replacement invoice</strong><small>Available after the credit note is issued</small></div>';
  }

  return `
    <article class="replacement-card">
      <header><div><p class="eyebrow">Editable replacement draft</p><h2>Copied from GGIOHK-0043</h2></div><span class="status-tag status-tag--draft">No invoice ID</span></header>
      <p>Original client and service details are copied into the one recoverable draft. Change the incorrect facts before issuing a new invoice.</p>
      <div class="replacement-fields"><label>Period start<input type="date" value="2025-12-15" /></label><label>Period end<input type="date" value="2025-12-16" /></label><label>Billable days<input type="number" value="2" step="0.25" /></label></div>
      <div class="linked-from">Linked from fully credited invoice <strong>GGIOHK-0043</strong></div>
      <a class="button button--primary replacement-link" href="/?variant=B&view=new-invoice">Continue in New Invoice</a>
    </article>
  `;
}

function renderGuidedVariant(): string {
  const activeStep = state.creditIssued ? (state.replacementStarted ? 3 : 2) : 1;
  return `
    <main class="correction-main guided-layout">
      <aside class="guided-steps" aria-label="Correction steps">
        <a class="back-link" href="/?variant=B&view=invoices">← Back to invoices</a>
        <p class="eyebrow">Correct GGIOHK-0043</p>
        <h1>Guided correction</h1>
        <ol>
          <li class="${activeStep === 1 ? "is-current" : "is-complete"}"><span>1</span><div><strong>Credit the original</strong><small>Create a full reversal</small></div></li>
          <li class="${activeStep === 2 ? "is-current" : activeStep > 2 ? "is-complete" : ""}"><span>2</span><div><strong>Check the record</strong><small>Both documents stay retained</small></div></li>
          <li class="${activeStep === 3 ? "is-current" : ""}"><span>3</span><div><strong>Replace if needed</strong><small>Start a new editable draft</small></div></li>
        </ol>
      </aside>
      <section class="guided-work">
        <header class="correction-heading"><div><p class="eyebrow">Step ${activeStep} of 3</p><h1>${state.creditIssued ? (state.replacementStarted ? "Edit the replacement" : "The original is fully credited") : "Reverse the issued invoice"}</h1></div><span class="chain-label">GGIOHK-0043 → CN-GGIOHK-0043</span></header>
        ${state.replacementStarted ? renderReplacementDraft() : `<div class="guided-columns"><div>${renderOriginalSummary()}<div class="link-explainer">Creates a new linked record. It does not edit the original.</div>${renderCreditControls()}</div>${renderCreditNotePreview()}</div>`}
      </section>
    </main>
  `;
}

function renderChainVariant(): string {
  return `
    <main class="correction-main chain-layout">
      <header class="correction-heading"><div><a class="back-link" href="/?variant=B&view=invoices">← Invoices</a><p class="eyebrow">Correction chain</p><h1>GGIOHK-0043</h1><p>Each step creates a new record. Nothing overwrites the document before it.</p></div><span class="status-tag ${state.creditIssued ? "status-tag--credited" : ""}">${state.creditIssued ? "Fully credited" : "Issued"}</span></header>
      <section class="chain-canvas" aria-label="Linked document chain">
        <div class="chain-node">${renderOriginalSummary()}</div>
        <div class="chain-arrow" aria-hidden="true"><span>Full credit</span>→</div>
        <div class="chain-node chain-node--focus"><div class="node-number">2</div>${renderCreditNotePreview("compact")}</div>
        <div class="chain-arrow" aria-hidden="true"><span>Optional</span>→</div>
        <div class="chain-node">${renderReplacementDraft()}</div>
      </section>
      <aside class="chain-inspector"><header><p class="eyebrow">${state.creditIssued ? "Next step" : "New linked document"}</p><h2>${state.creditIssued ? "Create a replacement?" : "Full credit note"}</h2></header>${renderCreditControls()}</aside>
    </main>
  `;
}

function renderAuditVariant(): string {
  return `
    <main class="correction-main audit-layout">
      <section class="audit-record">
        <header class="correction-heading"><div><a class="back-link" href="/?variant=B&view=invoices">← Invoices</a><p class="eyebrow">Document record</p><h1>GGIOHK-0043</h1></div><button type="button" class="button button--quiet" data-action="open-original">Open original PDF</button></header>
        <div class="audit-banner"><strong>The original remains issued and unchanged.</strong><span>${state.creditIssued ? "A full credit note now reverses its value." : "The correction will appear below as a separate linked document."}</span></div>
        <table class="audit-table"><thead><tr><th>Document</th><th>Issued</th><th>Value</th><th>Relationship</th><th>State</th></tr></thead><tbody><tr><td><strong>GGIOHK-0043</strong><small>Invoice</small></td><td>27 Dec 2025</td><td>$1,450.00</td><td>Original</td><td><span class="status-tag">Issued</span></td></tr>${state.creditIssued ? '<tr class="is-new"><td><strong>CN-GGIOHK-0043</strong><small>Credit note</small></td><td>2 Sep 2026</td><td>−$1,450.00</td><td>Fully credits GGIOHK-0043</td><td><span class="status-tag status-tag--credited">Issued</span></td></tr>' : ""}${state.replacementStarted ? '<tr class="is-new"><td><strong>Untitled draft</strong><small>Replacement</small></td><td>Not issued</td><td>Editing</td><td>Replaces GGIOHK-0043</td><td><span class="status-tag status-tag--draft">Draft</span></td></tr>' : ""}</tbody></table>
        <section class="audit-preview"><header><div><p class="eyebrow">Credit note preview</p><h2>CN-GGIOHK-0043</h2></div><span>Page 1 of 1</span></header>${renderCreditNotePreview("compact")}</section>
      </section>
      <aside class="audit-drawer"><div><p class="eyebrow">Correction</p><h2>${state.creditIssued ? "Credit note issued" : "Create a full credit note"}</h2><p>${state.creditIssued ? "The audit record now contains both immutable documents." : "State why the invoice must be reversed, then review the exact document before issue."}</p></div>${renderCreditControls()}${state.replacementStarted ? renderReplacementDraft() : ""}</aside>
    </main>
  `;
}

function renderVariant(): string {
  switch (state.variant) {
    case "A":
      return renderGuidedVariant();
    case "B":
      return renderChainVariant();
    case "C":
      return renderAuditVariant();
  }
}

function renderSwitcher(): string {
  const variant = CORRECTION_VARIANTS.find(({ key }) => key === state.variant);
  if (!variant) return "";
  return `
    <aside class="prototype-switcher" aria-label="Correction prototype variant switcher">
      <button type="button" aria-label="Previous correction variant" data-action="previous-variant">←</button>
      <div><strong>${variant.key} · ${variant.name}</strong><small>${variant.summary}</small></div>
      <button type="button" aria-label="Next correction variant" data-action="next-variant">→</button>
    </aside>
  `;
}

function renderCreditDialog(): string {
  if (!state.confirmCreditOpen) return "";
  return `
    <dialog class="dialog" aria-labelledby="credit-dialog-title" data-dialog>
      <p class="eyebrow">Final check</p>
      <h2 id="credit-dialog-title">Issue this full credit note?</h2>
      <p>This creates <strong>CN-GGIOHK-0043</strong> for <strong>−$1,450.00 USD</strong> and links it permanently to invoice <strong>GGIOHK-0043</strong>.</p>
      <dl class="confirm-facts"><div><dt>Reason</dt><dd>${escapeHtml(state.reason)}</dd></div><div><dt>Credit date</dt><dd>2 Sep 2026</dd></div><div><dt>VAT treatment</dt><dd>Original treatment retained</dd></div></dl>
      <div class="warning-note"><strong>The credit note cannot be edited or deleted after issue.</strong> The original invoice remains unchanged and becomes fully credited.</div>
      <div class="dialog-actions"><button type="button" class="button button--quiet" data-action="cancel-credit">Go back</button><button type="button" class="button button--danger" data-action="issue-credit" autofocus>Issue CN-GGIOHK-0043</button></div>
    </dialog>
  `;
}

function render(): void {
  const toast = state.statusMessage
    ? `<div class="app-toast" role="status" aria-live="polite">${escapeHtml(state.statusMessage)}</div>`
    : "";
  const switcher = import.meta.env.DEV ? renderSwitcher() : "";
  appElement.innerHTML = `<div class="app-shell app-shell--b correction-shell">${renderAppHeader()}${renderVariant()}</div>${toast}${switcher}${renderCreditDialog()}`;

  const dialog = appElement.querySelector("[data-dialog]");
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

function cycleVariant(direction: -1 | 1): void {
  const currentIndex = CORRECTION_VARIANTS.findIndex(({ key }) => key === state.variant);
  const nextIndex =
    (currentIndex + direction + CORRECTION_VARIANTS.length) % CORRECTION_VARIANTS.length;
  const nextVariant = CORRECTION_VARIANTS[nextIndex];
  if (!nextVariant) return;
  updateState({ ...state, variant: nextVariant.key, statusMessage: "" });
}

appElement.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement) || target.name !== "reason") return;
  state = { ...state, reason: target.value, showReasonError: false };
});

appElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) return;

  switch (actionElement.dataset.action) {
    case "previous-variant":
      cycleVariant(-1);
      break;
    case "next-variant":
      cycleVariant(1);
      break;
    case "review-credit":
      if (state.reason.trim() === "") {
        updateState({ ...state, showReasonError: true });
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLTextAreaElement>("#correction-reason")?.focus(),
        );
      } else {
        updateState({ ...state, confirmCreditOpen: true });
      }
      break;
    case "cancel-credit":
      updateState({ ...state, confirmCreditOpen: false });
      break;
    case "issue-credit":
      updateState({
        ...state,
        confirmCreditOpen: false,
        creditIssued: true,
        statusMessage: "CN-GGIOHK-0043 issued; GGIOHK-0043 is fully credited",
      });
      break;
    case "start-replacement":
      updateState({
        ...state,
        replacementStarted: true,
        statusMessage: "Replacement draft created without consuming an invoice number",
      });
      break;
    case "open-original":
      updateState({ ...state, statusMessage: "Opened the unchanged retained PDF" });
      break;
  }
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

render();
