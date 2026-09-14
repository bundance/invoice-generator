import "./style.css";

type VariantKey = "A" | "B" | "C";
type ScreenKey = "new" | "invoices" | "clients" | "settings";
type DraftSection = "client" | "work" | "tax" | "review";
type VatTreatment = "uk-taxable" | "outside-scope";
type ClientEditor = "existing" | "new";

type InvoiceDraft = {
  clientId: string;
  issueDate: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  billableDays: string;
  dayRate: string;
  currency: string;
  vatTreatment: VatTreatment;
  reverseCharge: boolean;
};

type PrototypeState = {
  variant: VariantKey;
  screen: ScreenKey;
  activeSection: DraftSection;
  clientEditor: ClientEditor;
  showValidation: boolean;
  unreadableData: boolean;
  issuedThisSession: boolean;
  lastAction: string;
  draft: InvoiceDraft;
};

type ValidationErrorKey =
  | "clientId"
  | "issueDate"
  | "description"
  | "periodStart"
  | "periodEnd"
  | "billableDays"
  | "dayRate";

type ValidationErrors = Partial<Record<ValidationErrorKey, string>>;

const variantDetails = {
  A: { name: "Workbench", note: "Everything visible, built for repeat use" },
  B: { name: "Guided focus", note: "One decision group at a time" },
  C: { name: "Document first", note: "Edit through a compact inspector" },
} satisfies Record<VariantKey, { name: string; note: string }>;

const screenDetails = {
  new: { label: "New Invoice", shortLabel: "New" },
  invoices: { label: "Invoices", shortLabel: "History" },
  clients: { label: "Clients", shortLabel: "Clients" },
  settings: { label: "Settings", shortLabel: "Settings" },
} satisfies Record<ScreenKey, { label: string; shortLabel: string }>;

const draftSections = {
  client: "Client",
  work: "Work",
  tax: "Tax",
  review: "Review",
} satisfies Record<DraftSection, string>;

const variantKeys = Object.keys(variantDetails).filter(isVariantKey);
const screenKeys = Object.keys(screenDetails).filter(isScreenKey);
const sectionKeys = Object.keys(draftSections).filter(isDraftSection);

const urlParameters = new URLSearchParams(window.location.search);

const state: PrototypeState = {
  variant: parseVariant(urlParameters.get("variant")),
  screen: parseScreen(urlParameters.get("screen")),
  activeSection: "client",
  clientEditor: "existing",
  showValidation: false,
  unreadableData: false,
  issuedThisSession: false,
  lastAction: "Prototype ready. Nothing is saved to disk.",
  draft: {
    clientId: "genesis-global",
    issueDate: "2026-09-02",
    description: "React Native development consultancy",
    periodStart: "2026-08-24",
    periodEnd: "2026-08-28",
    billableDays: "4.5",
    dayRate: "725",
    currency: "USD",
    vatTreatment: "outside-scope",
    reverseCharge: false,
  },
};

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("Prototype root element not found");
}

function isVariantKey(value: string): value is VariantKey {
  return value === "A" || value === "B" || value === "C";
}

function isScreenKey(value: string): value is ScreenKey {
  return value === "new" || value === "invoices" || value === "clients" || value === "settings";
}

function isDraftSection(value: string): value is DraftSection {
  return value === "client" || value === "work" || value === "tax" || value === "review";
}

function isVatTreatment(value: string): value is VatTreatment {
  return value === "uk-taxable" || value === "outside-scope";
}

function parseVariant(value: string | null): VariantKey {
  return value && isVariantKey(value) ? value : "A";
}

function parseScreen(value: string | null): ScreenKey {
  return value && isScreenKey(value) ? value : "new";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value: number, currency = state.draft.currency): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function parseDecimal(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateTotals() {
  const net = parseDecimal(state.draft.billableDays) * parseDecimal(state.draft.dayRate);
  const vat = state.draft.vatTreatment === "uk-taxable" ? net * 0.2 : 0;

  return { net, vat, total: net + vat };
}

function validateDraft(): ValidationErrors {
  const errors: ValidationErrors = {};
  const draft = state.draft;

  if (!draft.clientId) errors.clientId = "Choose a client.";
  if (!draft.issueDate) errors.issueDate = "Enter the issue date.";
  if (!draft.description.trim()) errors.description = "Describe the work.";
  if (!draft.periodStart) errors.periodStart = "Enter the period start.";
  if (!draft.periodEnd) errors.periodEnd = "Enter the period end.";
  if (draft.periodStart && draft.periodEnd && draft.periodStart > draft.periodEnd) {
    errors.periodEnd = "The end date must be on or after the start date.";
  }
  if (parseDecimal(draft.billableDays) <= 0) {
    errors.billableDays = "Billable days must be greater than zero.";
  }
  if (parseDecimal(draft.dayRate) <= 0) errors.dayRate = "The day rate must be greater than zero.";

  return errors;
}

function updateUrl(): void {
  const parameters = new URLSearchParams(window.location.search);
  parameters.set("variant", state.variant);
  parameters.set("screen", state.screen);
  window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
}

function moveVariant(offset: -1 | 1): void {
  const currentIndex = variantKeys.indexOf(state.variant);
  const nextIndex = (currentIndex + offset + variantKeys.length) % variantKeys.length;
  const nextVariant = variantKeys[nextIndex];

  if (!nextVariant) return;

  state.variant = nextVariant;
  state.lastAction = `Showing ${nextVariant}, ${variantDetails[nextVariant].name}.`;
  updateUrl();
  render();
}

function renderNavigation(navigationClass: string): string {
  return `
    <nav class="${navigationClass}" aria-label="Main navigation">
      ${screenKeys
        .map(
          (screen) => `
            <button
              type="button"
              class="navigation-item"
              data-screen="${screen}"
              aria-current="${state.screen === screen ? "page" : "false"}"
            >
              <span class="navigation-marker" aria-hidden="true">${screenDetails[screen].shortLabel.slice(0, 1)}</span>
              <span>${screenDetails[screen].label}</span>
            </button>
          `,
        )
        .join("")}
    </nav>
  `;
}

function renderScreenHeading(): string {
  const descriptions = {
    new: "One recoverable draft. Its number is only consumed when you issue it.",
    invoices: "Issued documents stay exactly as they were. Open the retained PDF or start a correction.",
    clients: "Client defaults make the next invoice faster and keep each number series separate.",
    settings: "Issuer details, local data, and the current app version.",
  } satisfies Record<ScreenKey, string>;

  return `
    <header class="screen-heading">
      <div>
        <p class="eyebrow">${state.variant} · ${escapeHtml(variantDetails[state.variant].name)}</p>
        <h1>${screenDetails[state.screen].label}</h1>
        <p>${descriptions[state.screen]}</p>
      </div>
      ${state.screen === "new" ? '<span class="draft-badge">Draft saved in memory</span>' : ""}
    </header>
  `;
}

function renderVariantShell(content: string): string {
  const status = `<div class="action-status" role="status" aria-live="polite">${escapeHtml(state.lastAction)}</div>`;

  if (state.variant === "A") {
    return `
      <div class="app-shell variant-a">
        <aside class="side-panel">
          <div class="brand"><span>CODER</span><strong>NETIC</strong><small>Invoices</small></div>
          ${renderNavigation("side-navigation")}
          <p class="prototype-note">Throwaway interaction prototype</p>
        </aside>
        <main class="main-surface">${renderScreenHeading()}${status}${content}</main>
      </div>
    `;
  }

  if (state.variant === "B") {
    return `
      <div class="app-shell variant-b">
        <header class="top-panel">
          <div class="brand"><span>CODER</span><strong>NETIC</strong></div>
          ${renderNavigation("top-navigation")}
          <span class="prototype-label">Prototype</span>
        </header>
        <main class="main-surface">${renderScreenHeading()}${status}${content}</main>
      </div>
    `;
  }

  return `
    <div class="app-shell variant-c">
      <aside class="rail-panel">
        <div class="brand-mark" aria-label="Codernetic Invoices">CN</div>
        ${renderNavigation("rail-navigation")}
      </aside>
      <main class="main-surface">${renderScreenHeading()}${status}${content}</main>
    </div>
  `;
}

function renderError(field: ValidationErrorKey, errors: ValidationErrors): string {
  const error = state.showValidation ? errors[field] : undefined;
  return error ? `<span class="field-error" id="${field}-error">${escapeHtml(error)}</span>` : "";
}

function renderFieldAttributes(field: ValidationErrorKey, errors: ValidationErrors): string {
  const hasError = Boolean(state.showValidation && errors[field]);
  return hasError ? `aria-invalid="true" aria-describedby="${field}-error"` : "aria-invalid=\"false\"";
}

function renderClientFields(errors: ValidationErrors): string {
  return `
    <fieldset class="form-section">
      <legend>Client and issue date</legend>
      <label class="field field-wide">
        <span>Client</span>
        <select name="clientId" ${renderFieldAttributes("clientId", errors)}>
          <option value="genesis-global" ${state.draft.clientId === "genesis-global" ? "selected" : ""}>Genesis Global</option>
          <option value="">Choose a client</option>
        </select>
        ${renderError("clientId", errors)}
        <small>USD, $725/day, outside the scope of UK VAT</small>
      </label>
      <label class="field">
        <span>Issue date</span>
        <input name="issueDate" type="date" value="${escapeHtml(state.draft.issueDate)}" ${renderFieldAttributes("issueDate", errors)} />
        ${renderError("issueDate", errors)}
      </label>
      <div class="field read-only-field">
        <span>Number if issued</span>
        <strong>GGIOHK-0044</strong>
        <small>The draft itself has no invoice ID.</small>
      </div>
    </fieldset>
  `;
}

function renderWorkFields(errors: ValidationErrors): string {
  return `
    <fieldset class="form-section">
      <legend>Work</legend>
      <label class="field field-wide">
        <span>Description</span>
        <textarea name="description" rows="4" ${renderFieldAttributes("description", errors)}>${escapeHtml(state.draft.description)}</textarea>
        ${renderError("description", errors)}
      </label>
      <label class="field">
        <span>Period start</span>
        <input name="periodStart" type="date" value="${escapeHtml(state.draft.periodStart)}" ${renderFieldAttributes("periodStart", errors)} />
        ${renderError("periodStart", errors)}
      </label>
      <label class="field">
        <span>Period end</span>
        <input name="periodEnd" type="date" value="${escapeHtml(state.draft.periodEnd)}" ${renderFieldAttributes("periodEnd", errors)} />
        ${renderError("periodEnd", errors)}
      </label>
      <label class="field">
        <span>Billable days</span>
        <input name="billableDays" type="number" min="0" step="0.25" value="${escapeHtml(state.draft.billableDays)}" ${renderFieldAttributes("billableDays", errors)} />
        ${renderError("billableDays", errors)}
      </label>
      <label class="field">
        <span>Day rate</span>
        <span class="input-with-prefix"><b aria-hidden="true">$</b><input name="dayRate" type="number" min="0" step="0.01" value="${escapeHtml(state.draft.dayRate)}" ${renderFieldAttributes("dayRate", errors)} /></span>
        ${renderError("dayRate", errors)}
      </label>
    </fieldset>
  `;
}

function renderTaxFields(): string {
  return `
    <fieldset class="form-section">
      <legend>VAT treatment</legend>
      <label class="field field-wide">
        <span>Treatment</span>
        <select name="vatTreatment">
          <option value="outside-scope" ${state.draft.vatTreatment === "outside-scope" ? "selected" : ""}>Outside the scope of UK VAT</option>
          <option value="uk-taxable" ${state.draft.vatTreatment === "uk-taxable" ? "selected" : ""}>UK taxable at 20%</option>
        </select>
        <small>This is chosen explicitly. The client's country does not decide it.</small>
      </label>
      <label class="check-field ${state.draft.vatTreatment === "uk-taxable" ? "is-muted" : ""}">
        <input name="reverseCharge" type="checkbox" ${state.draft.reverseCharge ? "checked" : ""} ${state.draft.vatTreatment === "uk-taxable" ? "disabled" : ""} />
        <span><strong>Add reverse-charge wording</strong><small>Use only when the client must account for tax in their country.</small></span>
      </label>
      <div class="tax-summary">
        <span>VAT shown on this invoice</span>
        <strong data-total="vat">${formatMoney(calculateTotals().vat)}</strong>
      </div>
    </fieldset>
  `;
}

function renderReadiness(errors: ValidationErrors): string {
  const errorMessages = Object.values(errors);
  const isReady = errorMessages.length === 0;
  const totals = calculateTotals();

  return `
    <section class="readiness-panel ${isReady ? "is-ready" : "has-errors"}" aria-labelledby="readiness-title">
      <div>
        <p class="eyebrow">Before issue</p>
        <h2 id="readiness-title">${isReady ? "Ready to issue" : `${errorMessages.length} details need attention`}</h2>
        <p>${isReady ? "Validation and PDF preparation happen before the permanent commit." : "Nothing has been numbered. Fix these details and try again."}</p>
        ${
          state.showValidation && !isReady
            ? `<ul class="error-summary">${errorMessages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
            : ""
        }
      </div>
      <div class="issue-actions">
        <strong data-total="total">${formatMoney(totals.total)}</strong>
        <button class="secondary-button" type="button" data-action="make-incomplete">Try incomplete draft</button>
        <button class="primary-button" type="button" data-action="issue" aria-disabled="${isReady ? "false" : "true"}" aria-describedby="issue-help">Issue invoice</button>
        <small id="issue-help">This will consume GGIOHK-0044 and make the invoice immutable.</small>
      </div>
    </section>
  `;
}

function formatDate(date: string): string {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function renderInvoicePreview(): string {
  const totals = calculateTotals();
  const vatLabel = state.draft.vatTreatment === "uk-taxable" ? "VAT @20%" : "VAT";

  return `
    <aside class="preview-panel" aria-label="Live invoice preview">
      <div class="preview-toolbar">
        <div><strong>Live A4 preview</strong><small>Updates as you type</small></div>
        <button type="button" class="text-button" data-action="preview-pdf">Open prepared PDF</button>
      </div>
      <article class="invoice-paper" aria-label="Invoice document">
        <div class="invoice-logo"><span>CODER</span><strong>NETIC</strong></div>
        <address><strong>Codernetic Ltd</strong><br />7 Coley Hill<br />Reading<br />Berkshire<br />RG1 6AE</address>
        <section class="invoice-meta">
          <div><em>Bacs details:</em><br />HSBC<br />Account Number: 54575059<br />Sort Code: 40-38-04</div>
          <div><strong>INVOICE <span>GGIOHK-0044</span><br /><span data-preview="issueDate">${formatDate(state.draft.issueDate)}</span></strong></div>
        </section>
        <section class="invoice-client"><strong>Invoice to:</strong><br /><span>Genesis Global</span></section>
        <table class="invoice-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Net Cost</th><th>${vatLabel}</th></tr></thead>
          <tbody>
            <tr class="service-row">
              <td><span data-preview="description">${escapeHtml(state.draft.description || "Work description")}</span><br /><br /><em>Invoice Period:</em><br /><span data-preview="period">${formatDate(state.draft.periodStart)} -<br />${formatDate(state.draft.periodEnd)}</span></td>
              <td><span data-preview="days">${escapeHtml(state.draft.billableDays || "0")}</span> days</td>
              <td><span data-preview="rate">${formatMoney(parseDecimal(state.draft.dayRate), state.draft.currency)}</span> per day</td>
              <td data-total="net">${formatMoney(totals.net)}</td>
              <td data-total="vat">${formatMoney(totals.vat)}</td>
            </tr>
            <tr><td></td><td></td><th>SUBTOTALS</th><td data-total="net">${formatMoney(totals.net)}</td><td data-total="vat">${formatMoney(totals.vat)}</td></tr>
            <tr class="total-row"><td></td><td></td><th>TOTAL</th><th data-total="total">${formatMoney(totals.total)}</th><th data-total="total">${formatMoney(totals.total)}</th></tr>
          </tbody>
        </table>
        <footer>
          <span data-preview="taxStatement">${state.draft.vatTreatment === "uk-taxable" ? "VAT charged at the standard UK rate." : "Outside the scope of UK VAT."}</span>
          ${state.draft.reverseCharge ? " Reverse charge applies." : ""}<br />
          VAT Registration Number 388 8021 60 · Company Reg. No. GB 8822243
        </footer>
      </article>
    </aside>
  `;
}

function renderIssueDialog(): string {
  const totals = calculateTotals();
  return `
    <dialog id="issue-dialog" class="confirmation-dialog" aria-labelledby="issue-dialog-title">
      <form method="dialog">
        <p class="eyebrow">Permanent action</p>
        <h2 id="issue-dialog-title">Issue GGIOHK-0044?</h2>
        <p>The app will retain this exact ${formatMoney(totals.total)} invoice and PDF. You cannot edit or delete it afterwards.</p>
        <dl><div><dt>Client</dt><dd>Genesis Global</dd></div><div><dt>Issue date</dt><dd>${formatDate(state.draft.issueDate)}</dd></div><div><dt>Invoice ID</dt><dd>GGIOHK-0044</dd></div></dl>
        <div class="dialog-actions">
          <button class="secondary-button" value="cancel">Keep editing</button>
          <button class="primary-button" type="button" data-action="confirm-issue">Issue and retain PDF</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderInvoiceCreation(): string {
  const errors = validateDraft();

  if (state.variant === "A") {
    return `
      <div class="creation-grid workbench-grid">
        <form id="draft-form" class="form-panel" aria-label="Invoice draft">
          ${renderClientFields(errors)}
          ${renderWorkFields(errors)}
          ${renderTaxFields()}
        </form>
        ${renderInvoicePreview()}
      </div>
      ${renderReadiness(errors)}
      ${renderIssueDialog()}
    `;
  }

  if (state.variant === "B") {
    const activeSectionIndex = sectionKeys.indexOf(state.activeSection);
    const sectionContent = {
      client: renderClientFields(errors),
      work: renderWorkFields(errors),
      tax: renderTaxFields(),
      review: renderReadiness(errors),
    } satisfies Record<DraftSection, string>;

    return `
      <div class="section-stepper" role="tablist" aria-label="Invoice sections">
        ${sectionKeys
          .map(
            (section, index) => `<button type="button" role="tab" aria-selected="${section === state.activeSection}" data-section="${section}"><span>${index + 1}</span>${draftSections[section]}</button>`,
          )
          .join("")}
      </div>
      <div class="creation-grid guided-grid">
        <form id="draft-form" class="guided-card" aria-label="${draftSections[state.activeSection]} invoice details">
          <p class="step-count">Step ${activeSectionIndex + 1} of ${sectionKeys.length}</p>
          ${sectionContent[state.activeSection]}
          <div class="step-actions">
            <button class="secondary-button" type="button" data-action="previous-section" ${activeSectionIndex === 0 ? "disabled" : ""}>Back</button>
            ${activeSectionIndex < sectionKeys.length - 1 ? '<button class="primary-button" type="button" data-action="next-section">Continue</button>' : ""}
          </div>
        </form>
        ${renderInvoicePreview()}
      </div>
      ${renderIssueDialog()}
    `;
  }

  const inspectorContent = {
    client: renderClientFields(errors),
    work: renderWorkFields(errors),
    tax: renderTaxFields(),
    review: renderReadiness(errors),
  } satisfies Record<DraftSection, string>;

  return `
    <div class="document-studio">
      ${renderInvoicePreview()}
      <form id="draft-form" class="inspector-panel" aria-label="Invoice inspector">
        <div class="inspector-tabs" role="tablist" aria-label="Editable document sections">
          ${sectionKeys
            .map(
              (section) => `<button type="button" role="tab" aria-selected="${section === state.activeSection}" data-section="${section}">${draftSections[section]}</button>`,
            )
            .join("")}
        </div>
        ${inspectorContent[state.activeSection]}
      </form>
    </div>
    ${renderIssueDialog()}
  `;
}

function renderInvoices(): string {
  return `
    <section class="content-card history-card" aria-labelledby="history-heading">
      <div class="card-heading"><div><p class="eyebrow">Document record</p><h2 id="history-heading">All issued documents</h2></div><label class="search-field"><span>Search</span><input type="search" placeholder="Invoice ID or client" /></label></div>
      <div class="status-filters" aria-label="Filter invoices"><button class="filter-chip is-active" type="button">All</button><button class="filter-chip" type="button">Issued</button><button class="filter-chip" type="button">Fully credited</button><button class="filter-chip" type="button">Replaced</button></div>
      <table class="history-table">
        <thead><tr><th>Invoice ID</th><th>Client</th><th>Issue date</th><th>Total</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          ${
            state.issuedThisSession
              ? '<tr><td><strong>GGIOHK-0044</strong></td><td>Genesis Global</td><td>2 Sep 2026</td><td>$3,262.50</td><td><span class="status-tag">Issued</span></td><td class="row-actions"><button type="button" data-action="open-pdf">Open PDF</button><button type="button" data-action="correct-invoice">Correct...</button></td></tr>'
              : ""
          }
          <tr><td><strong>GGIOHK-0043</strong></td><td>Genesis Global</td><td>27 Dec 2025</td><td>$1,450.00</td><td><span class="status-tag">Issued</span></td><td class="row-actions"><button type="button" data-action="open-pdf">Open PDF</button><button type="button" data-action="correct-invoice">Correct...</button></td></tr>
          <tr><td><strong>GGIOHK-0042</strong><small>CN-GGIOHK-0042</small></td><td>Genesis Global</td><td>30 Nov 2025</td><td>$2,175.00</td><td><span class="status-tag credited">Fully credited</span></td><td class="row-actions"><button type="button" data-action="open-pdf">Open documents</button><button type="button" data-action="correct-invoice">Create replacement...</button></td></tr>
        </tbody>
      </table>
      <p class="table-note">There is no edit or delete action. “Correct...” starts a separate credit-note flow without changing the original.</p>
    </section>
    <dialog id="correction-dialog" class="confirmation-dialog" aria-labelledby="correction-title">
      <form method="dialog"><p class="eyebrow">Immutable history</p><h2 id="correction-title">Correct this invoice</h2><p>The original will stay unchanged. The next prototype will settle the full credit-note and replacement steps.</p><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancel</button><button class="primary-button" type="button" data-action="acknowledge-correction">Continue to correction</button></div></form>
    </dialog>
  `;
}

function renderClients(): string {
  const editor =
    state.clientEditor === "existing"
      ? `
        <form class="client-form">
          <div class="form-section"><label class="field field-wide"><span>Client name</span><input value="Genesis Global" /></label><label class="field"><span>Invoice prefix</span><input value="GGIOHK" readonly /><small>Locked because this client has issued invoices.</small></label><label class="field"><span>Next invoice number</span><input value="44" readonly /></label></div>
          <div class="form-section"><label class="field"><span>Currency</span><select><option>USD</option></select></label><label class="field"><span>Standard day rate</span><input value="725.00" /></label><label class="field field-wide"><span>Default VAT treatment</span><select><option>Outside the scope of UK VAT</option><option>UK taxable at 20%</option></select><small>Defaults speed up drafts. Every invoice still shows the chosen treatment.</small></label></div>
          <div class="form-actions"><button class="secondary-button" type="button" data-action="discard-client-changes">Discard changes</button><button class="primary-button" type="button" data-action="save-client">Save client</button></div>
        </form>
      `
      : `
        <form class="client-form">
          <div class="form-section"><label class="field field-wide"><span>Client name</span><input autofocus placeholder="Company or person" /></label><label class="field"><span>Invoice prefix</span><input placeholder="Example: ACME" /><small>You can change this until the first invoice is issued.</small></label><label class="field"><span>First invoice number</span><input value="1" /></label></div>
          <div class="form-actions"><button class="secondary-button" type="button" data-action="cancel-new-client">Cancel</button><button class="primary-button" type="button" data-action="save-client">Add client</button></div>
        </form>
      `;

  return `
    <div class="management-grid">
      <section class="content-card client-list" aria-labelledby="clients-heading"><div class="card-heading"><div><p class="eyebrow">1 client</p><h2 id="clients-heading">Clients</h2></div><button class="primary-button" type="button" data-action="new-client">Add client</button></div><button class="client-row is-selected" type="button" data-action="existing-client"><span><strong>Genesis Global</strong><small>USD · $725/day</small></span><span><small>Next</small><strong>GGIOHK-0044</strong></span></button></section>
      <section class="content-card client-editor" aria-labelledby="client-editor-heading"><div class="card-heading"><div><p class="eyebrow">${state.clientEditor === "existing" ? "Client defaults" : "New client"}</p><h2 id="client-editor-heading">${state.clientEditor === "existing" ? "Genesis Global" : "Add a client"}</h2></div></div>${editor}</section>
    </div>
  `;
}

function renderSettings(): string {
  return `
    <div class="settings-stack">
      <section class="content-card settings-section" aria-labelledby="issuer-settings"><div class="card-heading"><div><p class="eyebrow">Fixed invoice identity</p><h2 id="issuer-settings">Issuer and payment details</h2></div><button class="secondary-button" type="button" data-action="save-settings">Save changes</button></div><div class="settings-summary"><div><span>Issuer</span><strong>Codernetic Ltd</strong><small>7 Coley Hill, Reading, Berkshire, RG1 6AE</small></div><div><span>Bank</span><strong>HSBC</strong><small>Account ending 5059 · Sort code 40-38-04</small></div><div><span>VAT registration</span><strong>388 8021 60</strong><small>Standard rate 20%</small></div></div></section>
      <section class="content-card settings-section" aria-labelledby="data-settings"><div class="card-heading"><div><p class="eyebrow">Local data</p><h2 id="data-settings">Backup and restore</h2><p>Backups contain financial and personal information and are not encrypted by the app.</p></div></div><div class="data-actions"><div><strong>Create a complete backup</strong><p>One archive with state.json and every retained PDF.</p><button class="secondary-button" type="button" data-action="create-backup">Create backup...</button></div><div><strong>Replace from a backup</strong><p>The selected archive is validated before it replaces the complete dataset. Records are never merged.</p><button class="danger-button" type="button" data-action="restore-backup">Restore backup...</button></div></div><button class="text-button danger-text" type="button" data-action="simulate-unreadable">Preview unreadable-data recovery</button></section>
      <section class="content-card about-row"><div><p class="eyebrow">About</p><h2>Codernetic Invoices</h2></div><strong>0.1.0-prototype</strong></section>
    </div>
    <dialog id="restore-dialog" class="confirmation-dialog" aria-labelledby="restore-title"><form method="dialog"><p class="eyebrow danger-text">Replace all local data</p><h2 id="restore-title">Restore this backup?</h2><p>The app has validated “codernetic-invoices-2026-09-02.zip”. Continuing replaces the current JSON data and every retained PDF.</p><label class="confirm-check"><input id="restore-confirmation" type="checkbox" /> <span>I understand that restore does not merge data.</span></label><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancel</button><button class="danger-button" type="button" data-action="confirm-restore" aria-disabled="true">Replace dataset</button></div></form></dialog>
  `;
}

function renderUnreadableData(): string {
  return `
    <main class="recovery-screen">
      <div class="recovery-card"><div class="brand"><span>CODER</span><strong>NETIC</strong></div><p class="eyebrow danger-text">Normal use has stopped</p><h1>Your invoice data cannot be read</h1><p>The app has left the existing files unchanged. It will not guess at their contents or open an empty dataset over them.</p><div class="recovery-detail"><strong>What you can do</strong><p>Restore a complete backup that this app can validate. Restore replaces the unreadable dataset rather than merging with it.</p></div><div class="recovery-actions"><button class="primary-button" type="button" data-action="recover-data">Choose backup...</button><button class="text-button" type="button" data-action="exit-recovery-preview">Exit prototype state</button></div><small>Support detail: state.json failed schema validation · schemaVersion unavailable</small></div>
    </main>
  `;
}

function renderPrototypeTools(): string {
  if (import.meta.env.PROD) return "";

  const variantIndex = variantKeys.indexOf(state.variant);
  const stateSnapshot = JSON.stringify(
    {
      variant: state.variant,
      screen: state.screen,
      activeSection: state.activeSection,
      unreadableData: state.unreadableData,
      issuedThisSession: state.issuedThisSession,
      draft: state.draft,
      validationErrors: validateDraft(),
    },
    null,
    2,
  );

  return `
    <details class="prototype-state">
      <summary>Prototype state</summary>
      <pre>${escapeHtml(stateSnapshot)}</pre>
    </details>
    <div class="prototype-switcher" aria-label="Prototype variant switcher">
      <button type="button" data-action="previous-variant" aria-label="Previous prototype variant">←</button>
      <div><strong>${state.variant} · ${variantDetails[state.variant].name}</strong><small>${variantIndex + 1} of ${variantKeys.length} · ${variantDetails[state.variant].note}</small></div>
      <button type="button" data-action="next-variant" aria-label="Next prototype variant">→</button>
    </div>
  `;
}

function renderDialogsAndScreen(): string {
  if (state.unreadableData) return renderUnreadableData();

  const screen = {
    new: renderInvoiceCreation,
    invoices: renderInvoices,
    clients: renderClients,
    settings: renderSettings,
  } satisfies Record<ScreenKey, () => string>;

  return renderVariantShell(screen[state.screen]());
}

function render(): void {
  appElement.innerHTML = `${renderDialogsAndScreen()}${renderPrototypeTools()}`;
}

function updateDerivedPreview(): void {
  const totals = calculateTotals();
  const textValues = {
    issueDate: formatDate(state.draft.issueDate),
    description: state.draft.description || "Work description",
    period: `${formatDate(state.draft.periodStart)} - ${formatDate(state.draft.periodEnd)}`,
    days: state.draft.billableDays || "0",
    rate: formatMoney(parseDecimal(state.draft.dayRate)),
    taxStatement:
      state.draft.vatTreatment === "uk-taxable"
        ? "VAT charged at the standard UK rate."
        : `Outside the scope of UK VAT.${state.draft.reverseCharge ? " Reverse charge applies." : ""}`,
  } satisfies Record<string, string>;

  for (const [key, value] of Object.entries(textValues)) {
    document.querySelectorAll<HTMLElement>(`[data-preview="${key}"]`).forEach((element) => {
      element.textContent = value;
    });
  }

  const totalValues = { net: totals.net, vat: totals.vat, total: totals.total } satisfies Record<
    string,
    number
  >;

  for (const [key, value] of Object.entries(totalValues)) {
    document.querySelectorAll<HTMLElement>(`[data-total="${key}"]`).forEach((element) => {
      element.textContent = formatMoney(value);
    });
  }
}

function focusFirstError(): void {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

function openDialog(dialogId: string): void {
  const dialog = document.querySelector<HTMLDialogElement>(`#${dialogId}`);
  dialog?.showModal();
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.name === "reverseCharge" && target instanceof HTMLInputElement) {
    state.draft.reverseCharge = target.checked;
    updateDerivedPreview();
    return;
  }

  const value = target.value;
  const draftField = target.name;

  if (draftField === "clientId") state.draft.clientId = value;
  if (draftField === "issueDate") state.draft.issueDate = value;
  if (draftField === "description") state.draft.description = value;
  if (draftField === "periodStart") state.draft.periodStart = value;
  if (draftField === "periodEnd") state.draft.periodEnd = value;
  if (draftField === "billableDays") state.draft.billableDays = value;
  if (draftField === "dayRate") state.draft.dayRate = value;
  if (draftField === "vatTreatment" && isVatTreatment(value)) {
    state.draft.vatTreatment = value;
    if (value === "uk-taxable") state.draft.reverseCharge = false;
    render();
    return;
  }

  updateDerivedPreview();
}

function setScreen(screen: ScreenKey): void {
  state.screen = screen;
  state.lastAction = `Opened ${screenDetails[screen].label}.`;
  updateUrl();
  render();
}

function moveSection(offset: -1 | 1): void {
  const currentIndex = sectionKeys.indexOf(state.activeSection);
  const nextSection = sectionKeys[currentIndex + offset];
  if (!nextSection) return;
  state.activeSection = nextSection;
  state.lastAction = `Opened ${draftSections[nextSection]} details.`;
  render();
}

function handleAction(action: string): void {
  if (action === "previous-variant") moveVariant(-1);
  if (action === "next-variant") moveVariant(1);
  if (action === "previous-section") moveSection(-1);
  if (action === "next-section") moveSection(1);

  if (action === "issue") {
    const errors = validateDraft();
    state.showValidation = true;
    if (Object.keys(errors).length > 0) {
      state.lastAction = "The draft is still unnumbered. Fix the highlighted details before issue.";
      render();
      focusFirstError();
      return;
    }
    openDialog("issue-dialog");
  }

  if (action === "make-incomplete") {
    state.draft.description = "";
    state.draft.periodEnd = "";
    state.showValidation = true;
    state.lastAction = "Showing inline and summary validation. The draft is still unnumbered.";
    render();
    focusFirstError();
  }

  if (action === "confirm-issue") {
    state.issuedThisSession = true;
    state.showValidation = false;
    state.screen = "invoices";
    state.lastAction = "GGIOHK-0044 was issued and its retained PDF is now the record.";
    updateUrl();
    render();
  }

  if (action === "preview-pdf") {
    state.lastAction = "Prepared PDF opened in a separate read-only preview. No number was consumed.";
    render();
  }

  if (action === "open-pdf") {
    state.lastAction = "Opened the exact retained PDF. It was not regenerated from current settings.";
    render();
  }

  if (action === "correct-invoice") openDialog("correction-dialog");
  if (action === "acknowledge-correction") {
    state.lastAction = "Correction entry point confirmed. The original invoice remains unchanged.";
    render();
  }

  if (action === "new-client") {
    state.clientEditor = "new";
    state.lastAction = "Opened a blank client record.";
    render();
  }
  if (action === "existing-client" || action === "cancel-new-client") {
    state.clientEditor = "existing";
    state.lastAction = "Opened Genesis Global.";
    render();
  }
  if (action === "save-client") {
    state.clientEditor = "existing";
    state.lastAction = "Client defaults saved in prototype memory.";
    render();
  }
  if (action === "discard-client-changes") {
    state.lastAction = "Client changes discarded.";
    render();
  }

  if (action === "save-settings") {
    state.lastAction = "Issuer settings saved in prototype memory.";
    render();
  }
  if (action === "create-backup") {
    state.lastAction = "Complete backup prepared: state.json and every retained PDF.";
    render();
  }
  if (action === "restore-backup") openDialog("restore-dialog");
  if (action === "confirm-restore") {
    const checkbox = document.querySelector<HTMLInputElement>("#restore-confirmation");
    if (!checkbox?.checked) return;
    state.lastAction = "Validated backup restored as a complete replacement.";
    render();
  }
  if (action === "simulate-unreadable") {
    state.unreadableData = true;
    state.lastAction = "Normal use stopped because state.json could not be validated.";
    render();
  }
  if (action === "recover-data") {
    state.unreadableData = false;
    state.screen = "settings";
    state.lastAction = "A valid backup replaced the unreadable dataset.";
    render();
  }
  if (action === "exit-recovery-preview") {
    state.unreadableData = false;
    state.screen = "settings";
    state.lastAction = "Exited the simulated recovery state without changing data.";
    render();
  }
}

appElement.addEventListener("submit", (event) => event.preventDefault());
appElement.addEventListener("input", handleInput);
appElement.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "restore-confirmation") {
    const button = document.querySelector<HTMLButtonElement>('[data-action="confirm-restore"]');
    button?.setAttribute("aria-disabled", String(!target.checked));
  }
});
appElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const screenButton = target.closest<HTMLElement>("[data-screen]");
  const requestedScreen = screenButton?.dataset.screen;
  if (requestedScreen && isScreenKey(requestedScreen)) {
    setScreen(requestedScreen);
    return;
  }

  const sectionButton = target.closest<HTMLElement>("[data-section]");
  const requestedSection = sectionButton?.dataset.section;
  if (requestedSection && isDraftSection(requestedSection)) {
    state.activeSection = requestedSection;
    state.lastAction = `Opened ${draftSections[requestedSection]} details.`;
    render();
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-action]");
  const action = actionButton?.dataset.action;
  if (action) handleAction(action);
});

window.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;
  const isEditing =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement?.getAttribute("contenteditable") === "true";

  if (isEditing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "ArrowLeft") moveVariant(-1);
  if (event.key === "ArrowRight") moveVariant(1);
});

render();
