// Three variants of the complete invoice desktop experience, switchable via
// `?variant=`, on one throwaway route.

type VariantKey = "A" | "B" | "C";
type Destination = "new-invoice" | "invoices" | "clients" | "settings";
type FormSection = "client" | "work" | "tax";
type DataScenario = "healthy" | "unreadable";

type Draft = {
  clientId: string;
  clientName: string;
  invoicePrefix: string;
  currency: "GBP" | "USD";
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  description: string;
  billableDays: string;
  dayRate: string;
  vatTreatment: "outside-scope" | "uk-taxable";
  reverseCharge: boolean;
};

type PrototypeState = {
  variant: VariantKey;
  destination: Destination;
  activeFormSection: FormSection;
  dataScenario: DataScenario;
  draft: Draft;
  issueDialogOpen: boolean;
  restoreDialogOpen: boolean;
  showValidation: boolean;
  justIssued: boolean;
  statusMessage: string;
};

type VariantDefinition = {
  key: VariantKey;
  name: string;
  summary: string;
};

type ClientDefaults = Pick<Draft, "clientName" | "invoicePrefix" | "currency" | "dayRate">;

const VARIANTS = [
  {
    key: "A",
    name: "Calm workbench",
    summary: "Persistent destinations, a readable form, and a full-height preview.",
  },
  {
    key: "B",
    name: "Document studio",
    summary: "The invoice leads; a focused inspector handles one section at a time.",
  },
  {
    key: "C",
    name: "Keyboard ledger",
    summary: "A compact, information-dense workspace for repeat invoicing.",
  },
] satisfies readonly VariantDefinition[];

const DESTINATIONS = [
  { key: "new-invoice", label: "New Invoice", shortcut: "N" },
  { key: "invoices", label: "Invoices", shortcut: "I" },
  { key: "clients", label: "Clients", shortcut: "C" },
  { key: "settings", label: "Settings", shortcut: "," },
] satisfies readonly { key: Destination; label: string; shortcut: string }[];

const FORM_SECTIONS = [
  { key: "client", label: "Client" },
  { key: "work", label: "Work" },
  { key: "tax", label: "Tax & issue" },
] satisfies readonly { key: FormSection; label: string }[];

const CLIENTS = {
  genesis: {
    clientName: "Genesis Global",
    invoicePrefix: "GGIOHK",
    currency: "USD",
    dayRate: "725",
  },
  acme: {
    clientName: "Acme Research Ltd",
    invoicePrefix: "ACME",
    currency: "GBP",
    dayRate: "850",
  },
} satisfies Record<"acme" | "genesis", ClientDefaults>;

const defaultDraft: Draft = {
  clientId: "genesis",
  clientName: CLIENTS.genesis.clientName,
  invoicePrefix: CLIENTS.genesis.invoicePrefix,
  currency: CLIENTS.genesis.currency,
  issueDate: "2026-09-02",
  periodStart: "2026-08-24",
  periodEnd: "2026-08-28",
  description:
    "React Native development consultancy.\nWork completed for the mobile application project.",
  billableDays: "5",
  dayRate: CLIENTS.genesis.dayRate,
  vatTreatment: "outside-scope",
  reverseCharge: false,
};

function getAppElement(): HTMLDivElement {
  const element = document.querySelector("#app");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Prototype root element was not found");
  }

  return element;
}

const appElement = getAppElement();

let state: PrototypeState = {
  variant: parseVariant(new URL(window.location.href).searchParams.get("variant")),
  destination: parseDestination(new URL(window.location.href).searchParams.get("view")),
  activeFormSection: "client",
  dataScenario: parseScenario(new URL(window.location.href).searchParams.get("scenario")),
  draft: defaultDraft,
  issueDialogOpen: false,
  restoreDialogOpen: false,
  showValidation: false,
  justIssued: false,
  statusMessage: "Draft saved on this Mac",
};

function parseVariant(value: string | null): VariantKey {
  switch (value) {
    case "B":
    case "C":
      return value;
    default:
      return "B";
  }
}

function parseDestination(value: string | null): Destination {
  switch (value) {
    case "invoices":
    case "clients":
    case "settings":
      return value;
    default:
      return "new-invoice";
  }
}

function parseScenario(value: string | null): DataScenario {
  return value === "unreadable" ? "unreadable" : "healthy";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getVariantDefinition(key: VariantKey): VariantDefinition {
  return VARIANTS.find((variant) => variant.key === key) ?? VARIANTS[0];
}

function setQueryState(
  nextState: Pick<PrototypeState, "variant" | "destination" | "dataScenario">,
): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", nextState.variant);
  url.searchParams.set("view", nextState.destination);

  if (nextState.dataScenario === "unreadable") {
    url.searchParams.set("scenario", "unreadable");
  } else {
    url.searchParams.delete("scenario");
  }

  window.history.replaceState({}, "", url);
}

function updateState(nextState: PrototypeState): void {
  state = nextState;
  setQueryState(state);
  render();
}

function cycleVariant(direction: -1 | 1): void {
  const currentIndex = VARIANTS.findIndex((variant) => variant.key === state.variant);
  const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
  const nextVariant = VARIANTS[nextIndex];

  updateState({ ...state, variant: nextVariant.key });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.valueOf())) {
    return value || "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function calculateNet(draft: Draft): number {
  const days = Number.parseFloat(draft.billableDays);
  const rate = Number.parseFloat(draft.dayRate);
  return Number.isFinite(days) && Number.isFinite(rate) ? days * rate : 0;
}

function calculateVat(draft: Draft): number {
  return draft.vatTreatment === "uk-taxable" ? calculateNet(draft) * 0.2 : 0;
}

function formatMoney(value: number, currency: Draft["currency"]): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function renderWordmark(): string {
  return '<span class="wordmark" aria-label="Codernetic">CODER<span>NETIC</span></span>';
}

function renderNavigation(className: string): string {
  return `
    <nav class="${className}" aria-label="Main navigation">
      ${DESTINATIONS.map(
        (destination) => `
          <button
            type="button"
            class="nav-item ${state.destination === destination.key ? "is-current" : ""}"
            data-destination="${destination.key}"
            ${state.destination === destination.key ? 'aria-current="page"' : ""}
          >
            <span>${destination.label}</span>
            <kbd>${destination.shortcut}</kbd>
          </button>
        `,
      ).join("")}
    </nav>
  `;
}

function renderStatusMessage(): string {
  return `<div class="save-status" role="status" aria-live="polite" data-save-status>${escapeHtml(state.statusMessage)}</div>`;
}

function renderField(options: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "number" | "date";
  hint?: string;
  suffix?: string;
  required?: boolean;
}): string {
  const hasError = state.showValidation && options.required && options.value.trim() === "";
  const descriptionId = `${options.id}-${hasError ? "error" : "hint"}`;

  return `
    <label class="field" for="${options.id}">
      <span class="field-label">${options.label}${options.required ? '<span aria-hidden="true"> *</span>' : ""}</span>
      <span class="input-wrap">
        <input
          id="${options.id}"
          name="${options.id}"
          type="${options.type ?? "text"}"
          value="${escapeHtml(options.value)}"
          ${options.type === "number" ? 'min="0" step="0.25" inputmode="decimal"' : ""}
          ${options.required ? 'aria-required="true"' : ""}
          ${hasError ? 'aria-invalid="true"' : ""}
          aria-describedby="${descriptionId}"
        />
        ${options.suffix ? `<span class="input-suffix">${options.suffix}</span>` : ""}
      </span>
      ${hasError ? `<span class="field-error" id="${descriptionId}">Enter ${options.label.toLowerCase()}.</span>` : `<span class="field-hint" id="${descriptionId}">${options.hint ?? ""}</span>`}
    </label>
  `;
}

function renderClientSelect(): string {
  return `
    <label class="field field--wide" for="clientId">
      <span class="field-label">Client <span aria-hidden="true">*</span></span>
      <select id="clientId" name="clientId" aria-required="true">
        <option value="genesis" ${state.draft.clientId === "genesis" ? "selected" : ""}>Genesis Global · USD · GGIOHK</option>
        <option value="acme" ${state.draft.clientId === "acme" ? "selected" : ""}>Acme Research Ltd · GBP · ACME</option>
      </select>
      <span class="field-hint">Currency, day rate, VAT treatment, and next number come from the client.</span>
    </label>
  `;
}

function renderDescriptionField(): string {
  const hasError = state.showValidation && state.draft.description.trim() === "";
  return `
    <label class="field field--wide" for="description">
      <span class="field-label">Description <span aria-hidden="true">*</span></span>
      <textarea
        id="description"
        name="description"
        rows="5"
        aria-required="true"
        ${hasError ? 'aria-invalid="true" aria-describedby="description-error"' : 'aria-describedby="description-hint"'}
      >${escapeHtml(state.draft.description)}</textarea>
      ${hasError ? '<span class="field-error" id="description-error">Enter a description.</span>' : '<span class="field-hint" id="description-hint">Shown verbatim in the single service line.</span>'}
    </label>
  `;
}

function renderVatFields(): string {
  return `
    <label class="field field--wide" for="vatTreatment">
      <span class="field-label">VAT treatment</span>
      <select id="vatTreatment" name="vatTreatment">
        <option value="outside-scope" ${state.draft.vatTreatment === "outside-scope" ? "selected" : ""}>Outside the scope of UK VAT</option>
        <option value="uk-taxable" ${state.draft.vatTreatment === "uk-taxable" ? "selected" : ""}>UK taxable at the standard rate</option>
      </select>
      <span class="field-hint">Tax treatment is explicit. An overseas client does not decide it.</span>
    </label>
    <label class="check-field">
      <input type="checkbox" name="reverseCharge" ${state.draft.reverseCharge ? "checked" : ""} />
      <span>
        <strong>Reverse charge applies</strong>
        <small>Add the reverse-charge statement to the issued document.</small>
      </span>
    </label>
  `;
}

function renderValidationSummary(): string {
  if (!state.showValidation) {
    return "";
  }

  const errors = getValidationErrors(state.draft);
  if (errors.length === 0) {
    return '<div class="validation-ok" role="status">All required invoice details are present.</div>';
  }

  return `
    <div class="validation-summary" role="alert" tabindex="-1">
      <strong>Fix ${errors.length} ${errors.length === 1 ? "detail" : "details"} before issuing</strong>
      <ul>${errors.map((error) => `<li><a href="#${error.field}">${error.message}</a></li>`).join("")}</ul>
    </div>
  `;
}

function getValidationErrors(draft: Draft): { field: keyof Draft; message: string }[] {
  const errors: { field: keyof Draft; message: string }[] = [];

  if (draft.clientId.trim() === "") errors.push({ field: "clientId", message: "Choose a client" });
  if (draft.issueDate.trim() === "")
    errors.push({ field: "issueDate", message: "Enter an issue date" });
  if (draft.periodStart.trim() === "")
    errors.push({ field: "periodStart", message: "Enter the period start" });
  if (draft.periodEnd.trim() === "")
    errors.push({ field: "periodEnd", message: "Enter the period end" });
  if (draft.description.trim() === "")
    errors.push({ field: "description", message: "Enter a description" });
  if (draft.billableDays.trim() === "")
    errors.push({ field: "billableDays", message: "Enter billable days" });
  if (draft.dayRate.trim() === "") errors.push({ field: "dayRate", message: "Enter the day rate" });

  return errors;
}

function renderIssueActions(): string {
  return `
    ${renderValidationSummary()}
    <div class="issue-actions">
      <button type="button" class="button button--quiet" data-action="discard">Discard draft</button>
      <div class="issue-actions-primary">
        ${renderStatusMessage()}
        <button type="button" class="button button--primary" data-action="issue" aria-describedby="issue-help">Review and issue</button>
      </div>
    </div>
    <p class="issue-help" id="issue-help">No invoice number is consumed until you confirm Issue in the next step.</p>
  `;
}

function renderFormA(): string {
  return `
    <form class="invoice-form invoice-form--a" aria-label="Invoice draft" novalidate>
      <header class="page-heading">
        <div><p class="eyebrow">Unnumbered draft</p><h1>New Invoice</h1></div>
        <span class="draft-chip">Autosaved locally</span>
      </header>
      <fieldset class="form-section">
        <legend>1. Client</legend>
        ${renderClientSelect()}
      </fieldset>
      <fieldset class="form-section">
        <legend>2. Work</legend>
        <div class="field-grid">
          ${renderField({ id: "periodStart", label: "Period start", value: state.draft.periodStart, type: "date", required: true })}
          ${renderField({ id: "periodEnd", label: "Period end", value: state.draft.periodEnd, type: "date", required: true })}
          ${renderDescriptionField()}
          ${renderField({ id: "billableDays", label: "Billable days", value: state.draft.billableDays, type: "number", suffix: "days", required: true })}
          ${renderField({ id: "dayRate", label: "Day rate", value: state.draft.dayRate, type: "number", suffix: state.draft.currency, required: true })}
        </div>
      </fieldset>
      <fieldset class="form-section">
        <legend>3. Tax and issue date</legend>
        <div class="field-grid">
          ${renderVatFields()}
          ${renderField({ id: "issueDate", label: "Issue date", value: state.draft.issueDate, type: "date", required: true })}
        </div>
      </fieldset>
      ${renderIssueActions()}
    </form>
  `;
}

function renderFormB(): string {
  const sectionContent = (() => {
    switch (state.activeFormSection) {
      case "client":
        return `${renderClientSelect()}<div class="client-facts"><span>Next number</span><strong>${state.draft.invoicePrefix}-0044</strong><span>Standard day rate</span><strong>${formatMoney(Number(state.draft.dayRate), state.draft.currency)}</strong></div>`;
      case "work":
        return `<div class="field-grid">${renderField({ id: "periodStart", label: "Period start", value: state.draft.periodStart, type: "date", required: true })}${renderField({ id: "periodEnd", label: "Period end", value: state.draft.periodEnd, type: "date", required: true })}${renderDescriptionField()}${renderField({ id: "billableDays", label: "Billable days", value: state.draft.billableDays, type: "number", suffix: "days", required: true })}${renderField({ id: "dayRate", label: "Day rate", value: state.draft.dayRate, type: "number", suffix: state.draft.currency, required: true })}</div>`;
      case "tax":
        return `<div class="field-grid">${renderVatFields()}${renderField({ id: "issueDate", label: "Issue date", value: state.draft.issueDate, type: "date", required: true })}</div>${renderIssueActions()}`;
    }
  })();

  return `
    <form class="invoice-form invoice-form--b" aria-label="Invoice draft" novalidate>
      <header class="inspector-heading">
        <div><p class="eyebrow">Draft inspector</p><h1>New Invoice</h1></div>
        ${renderStatusMessage()}
      </header>
      <div class="section-tabs" aria-label="Invoice sections">
        ${FORM_SECTIONS.map(
          (section) =>
            `<button type="button" aria-pressed="${state.activeFormSection === section.key}" class="section-tab ${state.activeFormSection === section.key ? "is-current" : ""}" data-section="${section.key}">${section.label}</button>`,
        ).join("")}
      </div>
      <section class="inspector-section" aria-label="${FORM_SECTIONS.find((section) => section.key === state.activeFormSection)?.label ?? "Invoice details"}">
        ${sectionContent}
      </section>
      ${state.activeFormSection !== "tax" ? '<div class="inspector-next"><button type="button" class="button button--primary" data-action="next-section">Continue</button></div>' : ""}
    </form>
  `;
}

function renderFormC(): string {
  return `
    <form class="invoice-form invoice-form--c" aria-label="Invoice draft" novalidate>
      <header class="ledger-heading">
        <div><p class="eyebrow">Draft · not numbered</p><h1>Invoice worksheet</h1></div>
        ${renderStatusMessage()}
      </header>
      ${renderValidationSummary()}
      <div class="worksheet-rows">
        <div class="worksheet-row"><span class="row-number">01</span>${renderClientSelect()}</div>
        <div class="worksheet-row"><span class="row-number">02</span><div class="field-grid">${renderField({ id: "periodStart", label: "Period start", value: state.draft.periodStart, type: "date", required: true })}${renderField({ id: "periodEnd", label: "Period end", value: state.draft.periodEnd, type: "date", required: true })}</div></div>
        <div class="worksheet-row"><span class="row-number">03</span>${renderDescriptionField()}</div>
        <div class="worksheet-row"><span class="row-number">04</span><div class="field-grid">${renderField({ id: "billableDays", label: "Billable days", value: state.draft.billableDays, type: "number", suffix: "days", required: true })}${renderField({ id: "dayRate", label: "Day rate", value: state.draft.dayRate, type: "number", suffix: state.draft.currency, required: true })}</div></div>
        <div class="worksheet-row"><span class="row-number">05</span><div class="field-grid">${renderVatFields()}${renderField({ id: "issueDate", label: "Issue date", value: state.draft.issueDate, type: "date", required: true })}</div></div>
      </div>
      <footer class="ledger-actions">
        <span><kbd>⌘</kbd><kbd>↵</kbd> Review and issue</span>
        <button type="button" class="button button--primary" data-action="issue" aria-label="Review and issue invoice">Review and issue</button>
      </footer>
    </form>
  `;
}

function renderInvoicePreview(): string {
  const net = calculateNet(state.draft);
  const vat = calculateVat(state.draft);
  const total = net + vat;
  const descriptionLines = escapeHtml(state.draft.description).replaceAll("\n", "<br />");

  return `
    <article class="invoice-preview" aria-label="Live A4 invoice preview">
      <header class="paper-header">
        ${renderWordmark()}
        <address><strong>Codernetic Ltd</strong><br />7 Coley Hill<br />Reading<br />Berkshire<br />RG1 6AE</address>
      </header>
      <section class="paper-meta">
        <div><em>Bacs details:</em><br />HSBC<br />Account Number: 54575059<br />Sort Code: 40-38-04<br /><br /><strong>Invoice to:</strong><br />${escapeHtml(state.draft.clientName)}</div>
        <div class="paper-title"><span>DRAFT INVOICE</span><small>Next number ${escapeHtml(state.draft.invoicePrefix)}-0044</small><strong>${formatDate(state.draft.issueDate)}</strong></div>
      </section>
      <table class="paper-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Net Cost</th><th>VAT<br />@20%</th></tr></thead>
        <tbody>
          <tr class="paper-line"><td>${descriptionLines}<br /><br /><em>Invoice Period:</em><br /><br />${formatDate(state.draft.periodStart)} -<br />${formatDate(state.draft.periodEnd)}</td><td>${escapeHtml(state.draft.billableDays || "0")} days</td><td>${formatMoney(Number.parseFloat(state.draft.dayRate) || 0, state.draft.currency)} per day</td><td>${formatMoney(net, state.draft.currency)}</td><td>${formatMoney(vat, state.draft.currency)}</td></tr>
          <tr><td></td><td></td><th>SUBTOTALS</th><td>${formatMoney(net, state.draft.currency)}</td><td>${formatMoney(vat, state.draft.currency)}</td></tr>
          <tr class="paper-total"><td></td><td></td><th>TOTAL</th><td colspan="2">${formatMoney(total, state.draft.currency)}</td></tr>
        </tbody>
      </table>
      <footer class="paper-footer">All amounts are shown in ${state.draft.currency === "USD" ? "US dollars" : "Sterling"}. VAT Registration Number 388 8021 60<br />Company Reg. No. GB 8822243</footer>
    </article>
  `;
}

function renderPreviewPanel(title = "Live A4 preview"): string {
  return `
    <section class="preview-panel" aria-label="${title}">
      <header class="preview-toolbar"><div><span class="live-dot" aria-hidden="true"></span><strong>${title}</strong></div><span>100%</span></header>
      <div class="paper-stage" data-preview-host>${renderInvoicePreview()}</div>
    </section>
  `;
}

function renderNewInvoice(variant: VariantKey): string {
  switch (variant) {
    case "A":
      return `<div class="workbench">${renderFormA()}${renderPreviewPanel()}</div>`;
    case "B":
      return `<div class="document-studio">${renderPreviewPanel("Invoice canvas")}${renderFormB()}</div>`;
    case "C":
      return `<div class="ledger-workspace">${renderFormC()}${renderPreviewPanel("Proof")}</div>`;
  }
}

function renderInvoicesPage(variant: VariantKey): string {
  const rows = `
    <tr class="${state.justIssued ? "is-new" : ""}"><td><strong>GGIOHK-0044</strong><small>Genesis Global</small></td><td>2 Sep 2026</td><td>${formatMoney(3625, "USD")}</td><td><span class="status-tag">Issued</span></td><td><button type="button" class="text-button" data-action="open-pdf">Open PDF</button><button type="button" class="text-button" data-action="correct-invoice">Correct…</button></td></tr>
    <tr><td><strong>GGIOHK-0043</strong><small>Genesis Global</small></td><td>27 Dec 2025</td><td>${formatMoney(1450, "USD")}</td><td><span class="status-tag status-tag--credited">Fully credited</span></td><td><button type="button" class="text-button" data-action="open-pdf">Open PDF</button><button type="button" class="text-button">View chain</button></td></tr>
    <tr><td><strong>ACME-0012</strong><small>Acme Research Ltd</small></td><td>30 Nov 2025</td><td>${formatMoney(3400, "GBP")}</td><td><span class="status-tag">Issued</span></td><td><button type="button" class="text-button" data-action="open-pdf">Open PDF</button><button type="button" class="text-button" data-action="correct-invoice">Correct…</button></td></tr>
  `;

  return `
    <section class="support-page support-page--${variant.toLowerCase()}">
      <header class="support-heading"><div><p class="eyebrow">Immutable record</p><h1>Invoices</h1><p>Issued documents stay exactly as they were. Open the retained PDF or begin a correction.</p></div><label class="search-field"><span class="sr-only">Search invoices</span><input type="search" placeholder="Search ID or client" /></label></header>
      ${state.justIssued ? '<div class="success-banner" role="status"><strong>GGIOHK-0044 issued.</strong> Its exact PDF is retained. Editing is no longer possible.</div>' : ""}
      <div class="table-wrap"><table class="history-table"><thead><tr><th>Invoice</th><th>Issued</th><th>Total</th><th>State</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="deferred-note">The “Correct…” action is intentionally shallow here. The credit-note and replacement experience has its own prototype ticket.</p>
    </section>
  `;
}

function renderClientsPage(variant: VariantKey): string {
  return `
    <section class="support-page support-page--${variant.toLowerCase()}">
      <header class="support-heading"><div><p class="eyebrow">Two clients</p><h1>Clients</h1><p>Defaults reduce repeated typing. Issued invoices keep their original client snapshot.</p></div><button type="button" class="button button--primary" data-action="new-client">New client</button></header>
      <div class="client-layout">
        <div class="client-list">
          <button type="button" class="client-row is-current"><span class="client-avatar">GG</span><span><strong>Genesis Global</strong><small>USD · Outside UK VAT</small></span><span>›</span></button>
          <button type="button" class="client-row"><span class="client-avatar">AR</span><span><strong>Acme Research Ltd</strong><small>GBP · UK taxable</small></span><span>›</span></button>
        </div>
        <form class="client-editor" aria-label="Edit Genesis Global">
          <header><div><p class="eyebrow">Client details</p><h2>Genesis Global</h2></div><span class="status-tag">12 invoices</span></header>
          <div class="field-grid">
            ${renderField({ id: "clientNameDisplay", label: "Display name", value: "Genesis Global", required: true })}
            ${renderField({ id: "invoicePrefixDisplay", label: "Invoice prefix", value: "GGIOHK", hint: "Locked after the first invoice." })}
            ${renderField({ id: "currencyDisplay", label: "Currency", value: "USD" })}
            ${renderField({ id: "standardRateDisplay", label: "Standard day rate", value: "725", type: "number", suffix: "USD" })}
          </div>
          <div class="locked-note"><strong>GGIOHK is locked.</strong> Changing the prefix after an invoice exists would break the client sequence.</div>
          <div class="editor-actions"><button type="button" class="button button--quiet">Cancel</button><button type="button" class="button button--primary" data-action="save-client">Save client</button></div>
        </form>
      </div>
    </section>
  `;
}

function renderSettingsPage(variant: VariantKey): string {
  return `
    <section class="support-page support-page--${variant.toLowerCase()}">
      <header class="support-heading"><div><p class="eyebrow">This Mac</p><h1>Settings</h1><p>Issuer details affect new drafts. Issued documents remain unchanged.</p></div><span class="version-pill">Version 0.1.0</span></header>
      <div class="settings-layout">
        <div class="settings-main">
          <section class="settings-section"><header><h2>Issuer</h2><p>Used when a new invoice draft is created.</p></header><div class="field-grid">${renderField({ id: "issuerName", label: "Company name", value: "Codernetic Ltd" })}${renderField({ id: "vatNumber", label: "VAT registration number", value: "388 8021 60" })}${renderField({ id: "companyNumber", label: "Company number", value: "GB 8822243" })}</div><button type="button" class="button button--primary" data-action="save-settings">Save issuer details</button></section>
          <section class="settings-section"><header><h2>Bank details</h2><p>Printed on new invoices. Historical PDFs do not change.</p></header><div class="field-grid">${renderField({ id: "bankName", label: "Bank", value: "HSBC" })}${renderField({ id: "sortCode", label: "Sort code", value: "40-38-04" })}${renderField({ id: "accountNumber", label: "Account number", value: "54575059" })}</div></section>
        </div>
        <aside class="data-card">
          <p class="eyebrow">Complete dataset</p><h2>Backup and restore</h2><p>A backup contains all settings, clients, invoice records, and retained PDFs. It is unencrypted.</p>
          <button type="button" class="button button--primary button--full" data-action="backup">Create backup…</button>
          <button type="button" class="button button--quiet button--full" data-action="restore">Restore backup…</button>
          <div class="warning-note"><strong>Restore replaces everything.</strong> The selected archive is validated before the current dataset changes.</div>
          <button type="button" class="text-button recovery-preview-link" data-action="show-recovery">Preview unreadable-data recovery state</button>
        </aside>
      </div>
    </section>
  `;
}

function renderDestination(variant: VariantKey): string {
  switch (state.destination) {
    case "new-invoice":
      return renderNewInvoice(variant);
    case "invoices":
      return renderInvoicesPage(variant);
    case "clients":
      return renderClientsPage(variant);
    case "settings":
      return renderSettingsPage(variant);
  }
}

function renderVariantA(): string {
  return `<div class="app-shell app-shell--a"><aside class="side-rail"><div class="brand-block">${renderWordmark()}<small>Invoice desk</small></div>${renderNavigation("side-nav")}<div class="rail-foot"><span class="health-dot"></span>Data stored on this Mac</div></aside><main class="app-main">${renderDestination("A")}</main></div>`;
}

function renderVariantB(): string {
  return `<div class="app-shell app-shell--b"><header class="top-bar"><div class="brand-block">${renderWordmark()}<small>Invoice Studio</small></div>${renderNavigation("top-nav")}<button type="button" class="profile-button" aria-label="Open app information">ME</button></header><main class="app-main">${renderDestination("B")}</main></div>`;
}

function renderVariantC(): string {
  return `<div class="app-shell app-shell--c"><header class="command-bar"><div class="brand-block">${renderWordmark()}</div>${renderNavigation("command-nav")}<div class="command-status"><span class="health-dot"></span>Local · Saved</div></header><main class="app-main"><div class="route-strip"><span>${DESTINATIONS.find((item) => item.key === state.destination)?.label}</span><span>⌘K Command menu</span></div>${renderDestination("C")}</main></div>`;
}

function renderSwitcher(): string {
  const variant = getVariantDefinition(state.variant);
  return `
    <aside class="prototype-switcher" aria-label="Prototype variant switcher">
      <button type="button" aria-label="Previous variant" data-action="previous-variant">←</button>
      <div><strong>${variant.key} · ${variant.name}</strong><small>${variant.summary}</small></div>
      <button type="button" aria-label="Next variant" data-action="next-variant">→</button>
    </aside>
  `;
}

function renderIssueDialog(): string {
  if (!state.issueDialogOpen) return "";
  const net = calculateNet(state.draft);
  const total = net + calculateVat(state.draft);
  return `
    <dialog class="dialog" aria-labelledby="issue-dialog-title" data-dialog>
        <p class="eyebrow">Final check</p>
        <h2 id="issue-dialog-title">Issue this invoice?</h2>
        <p>This creates <strong>${escapeHtml(state.draft.invoicePrefix)}-0044</strong> for <strong>${escapeHtml(state.draft.clientName)}</strong> with a total of <strong>${formatMoney(total, state.draft.currency)}</strong>.</p>
        <div class="warning-note"><strong>You cannot edit or delete it afterwards.</strong> A later correction creates a full credit note and a new replacement invoice.</div>
        <dl class="confirm-facts"><div><dt>Invoice date</dt><dd>${formatDate(state.draft.issueDate)}</dd></div><div><dt>Period</dt><dd>${formatDate(state.draft.periodStart)} to ${formatDate(state.draft.periodEnd)}</dd></div><div><dt>VAT treatment</dt><dd>${state.draft.vatTreatment === "uk-taxable" ? "UK taxable at 20%" : "Outside UK VAT"}</dd></div></dl>
        <div class="dialog-actions"><button type="button" class="button button--quiet" data-action="cancel-issue">Go back</button><button type="button" class="button button--danger" data-action="confirm-issue" autofocus>Issue ${escapeHtml(state.draft.invoicePrefix)}-0044</button></div>
    </dialog>
  `;
}

function renderRestoreDialog(): string {
  if (!state.restoreDialogOpen) return "";
  return `
    <dialog class="dialog" aria-labelledby="restore-dialog-title" data-dialog>
        <p class="eyebrow">Selected backup</p><h2 id="restore-dialog-title">Replace this dataset?</h2>
        <div class="archive-summary"><strong>codernetic-backup-2026-09-01.zip</strong><span>Validated · schema version 1</span><span>2 clients · 14 invoices · 15 PDFs</span></div>
        <div class="warning-note"><strong>The current dataset will be replaced, not merged.</strong> Quit any other copy of the app before continuing.</div>
        <div class="dialog-actions"><button type="button" class="button button--quiet" data-action="cancel-restore">Cancel</button><button type="button" class="button button--danger" data-action="confirm-restore" autofocus>Replace and restart</button></div>
    </dialog>
  `;
}

function renderRecoveryScreen(): string {
  return `
    <main class="recovery-shell">
      <section class="recovery-card" aria-labelledby="recovery-title">
        ${renderWordmark()}
        <div class="recovery-icon" aria-hidden="true">!</div>
        <p class="eyebrow">Normal use has stopped</p>
        <h1 id="recovery-title">Your invoice data could not be opened</h1>
        <p>The app has not changed or replaced the unreadable data. Restore a complete backup to continue.</p>
        <div class="error-detail"><strong>What happened</strong><span>state.json does not match a supported data format.</span></div>
        <button type="button" class="button button--primary button--full" data-action="restore">Choose backup…</button>
        <button type="button" class="button button--quiet button--full" data-action="exit-recovery">Return to prototype</button>
        <small>Backups contain financial and personal information and are not encrypted by this app.</small>
      </section>
    </main>
  `;
}

function render(): void {
  const appMarkup = (() => {
    if (state.dataScenario === "unreadable") return renderRecoveryScreen();
    switch (state.variant) {
      case "A":
        return renderVariantA();
      case "B":
        return renderVariantB();
      case "C":
        return renderVariantC();
    }
  })();

  const showToast = state.statusMessage !== "Draft saved on this Mac";
  const switcherMarkup = import.meta.env.DEV ? renderSwitcher() : "";
  appElement.innerHTML = `${appMarkup}${showToast ? `<div class="app-toast" role="status" aria-live="polite">${escapeHtml(state.statusMessage)}</div>` : ""}${switcherMarkup}${renderIssueDialog()}${renderRestoreDialog()}`;

  const dialog = appElement.querySelector("[data-dialog]");
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();

  const autofocusElement = appElement.querySelector("[autofocus]");
  if (autofocusElement instanceof HTMLElement) autofocusElement.focus();
}

function updatePreview(): void {
  const previewHost = appElement.querySelector("[data-preview-host]");
  if (previewHost instanceof HTMLElement) previewHost.innerHTML = renderInvoicePreview();

  const saveStatus = appElement.querySelector("[data-save-status]");
  if (saveStatus instanceof HTMLElement) saveStatus.textContent = "Saving draft…";
  window.setTimeout(() => {
    if (saveStatus instanceof HTMLElement && saveStatus.isConnected)
      saveStatus.textContent = "Draft saved on this Mac";
  }, 350);
}

function getDraftField(name: string): keyof Draft | null {
  switch (name) {
    case "issueDate":
    case "periodStart":
    case "periodEnd":
    case "description":
    case "billableDays":
    case "dayRate":
      return name;
    default:
      return null;
  }
}

appElement.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const field = getDraftField(target.name);
  if (field === null) return;

  state = {
    ...state,
    draft: { ...state.draft, [field]: target.value },
    statusMessage: "Draft saved on this Mac",
  };
  updatePreview();
});

appElement.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  if (target.name === "clientId") {
    const client = target.value === "acme" ? CLIENTS.acme : CLIENTS.genesis;
    updateState({
      ...state,
      draft: { ...state.draft, clientId: target.value, ...client },
      statusMessage: "Draft saved on this Mac",
    });
    return;
  }

  if (target.name === "vatTreatment") {
    const vatTreatment = target.value === "uk-taxable" ? "uk-taxable" : "outside-scope";
    updateState({ ...state, draft: { ...state.draft, vatTreatment } });
    return;
  }

  if (target.name === "reverseCharge" && target instanceof HTMLInputElement) {
    updateState({ ...state, draft: { ...state.draft, reverseCharge: target.checked } });
  }
});

appElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest<HTMLElement>(
    "[data-action], [data-destination], [data-section]",
  );
  if (!actionElement) return;

  const destination = actionElement.dataset.destination;
  if (destination) {
    updateState({
      ...state,
      destination: parseDestination(destination),
      statusMessage: "Draft saved on this Mac",
    });
    return;
  }

  const section = actionElement.dataset.section;
  if (section === "client" || section === "work" || section === "tax") {
    updateState({ ...state, activeFormSection: section });
    return;
  }

  switch (actionElement.dataset.action) {
    case "previous-variant":
      cycleVariant(-1);
      break;
    case "next-variant":
      cycleVariant(1);
      break;
    case "next-section": {
      const nextSection = state.activeFormSection === "client" ? "work" : "tax";
      updateState({ ...state, activeFormSection: nextSection });
      break;
    }
    case "issue": {
      const errors = getValidationErrors(state.draft);
      updateState({ ...state, showValidation: true, issueDialogOpen: errors.length === 0 });
      if (errors.length > 0) {
        window.requestAnimationFrame(() => {
          const summary = appElement.querySelector(".validation-summary");
          if (summary instanceof HTMLElement) summary.focus();
        });
      }
      break;
    }
    case "cancel-issue":
      updateState({ ...state, issueDialogOpen: false });
      break;
    case "confirm-issue":
      updateState({
        ...state,
        issueDialogOpen: false,
        destination: "invoices",
        justIssued: true,
        statusMessage: "GGIOHK-0044 issued",
      });
      break;
    case "discard":
      updateState({ ...state, statusMessage: "Discard is intentionally not simulated" });
      break;
    case "backup":
      updateState({ ...state, statusMessage: "Backup created: codernetic-backup-2026-09-02.zip" });
      break;
    case "restore":
      updateState({ ...state, restoreDialogOpen: true });
      break;
    case "cancel-restore":
      updateState({ ...state, restoreDialogOpen: false });
      break;
    case "confirm-restore":
      updateState({
        ...state,
        restoreDialogOpen: false,
        dataScenario: "healthy",
        destination: "settings",
        statusMessage: "Backup restored; prototype restarted",
      });
      break;
    case "show-recovery":
      updateState({ ...state, dataScenario: "unreadable", restoreDialogOpen: false });
      break;
    case "exit-recovery":
      updateState({ ...state, dataScenario: "healthy", destination: "settings" });
      break;
    case "open-pdf":
      updateState({ ...state, statusMessage: "Opened the exact retained PDF" });
      break;
    case "correct-invoice":
      window.location.href = "/correction.html?variant=A";
      break;
    case "new-client":
      updateState({ ...state, statusMessage: "New-client form would open here" });
      break;
    case "save-client":
      updateState({ ...state, statusMessage: "Client defaults saved" });
      break;
    case "save-settings":
      updateState({ ...state, statusMessage: "Issuer settings saved for future drafts" });
      break;
  }
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  if (event.key === "Escape" && state.issueDialogOpen) {
    updateState({ ...state, issueDialogOpen: false });
    return;
  }

  if (event.key === "Escape" && state.restoreDialogOpen) {
    updateState({ ...state, restoreDialogOpen: false });
    return;
  }

  if (isEditing) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    cycleVariant(-1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    cycleVariant(1);
  }

  if (event.metaKey && event.key === "Enter" && state.destination === "new-invoice") {
    event.preventDefault();
    const errors = getValidationErrors(state.draft);
    updateState({ ...state, showValidation: true, issueDialogOpen: errors.length === 0 });
  }
});

render();
