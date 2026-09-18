import type { WorkspaceSummary } from "../../../application/invoice-application-contract.ts";
import { FormField, FormSaveStatus } from "../../ui/form-controls.tsx";
import { PageHeader } from "../../ui/page-header.tsx";
import { DatasetBackupCard } from "./dataset-backup-card.tsx";
import type { IssuerSettingsForm } from "./use-issuer-settings-form.ts";

type SettingsPageProps = Pick<WorkspaceSummary, "appVersion" | "issuer"> &
  Readonly<{
    issuerSettingsForm: IssuerSettingsForm;
  }>;

export function SettingsPage({ appVersion, issuer, issuerSettingsForm }: SettingsPageProps) {
  const { errors, register, saveStatus, submit } = issuerSettingsForm;

  return (
    <>
      <PageHeader
        eyebrow="Local application"
        heading="Settings"
        summary="Manage the issuer details printed on invoices and this Mac's local dataset."
      />
      <div className="settings-layout">
        <form className="settings-form" noValidate onSubmit={submit}>
          <header className="settings-form-header">
            <div className="settings-form-heading">
              <p className="eyebrow">Fixed invoice identity</p>
              <div className="settings-form-copy">
                <h2>Issuer and payment details</h2>
                <div>
                  <p>Changes apply to future documents. Issued documents stay unchanged.</p>
                  {issuer ? null : <p className="next-step">Next: add issuer details.</p>}
                </div>
              </div>
            </div>
            <FormSaveStatus
              label={
                {
                  "not-saved": "Not saved yet",
                  saving: "Saving",
                  saved: "Saved on this Mac",
                  error: "Could not save",
                }[saveStatus]
              }
              status={saveStatus}
            />
          </header>

          <fieldset className="settings-fieldset">
            <legend>Issuer details</legend>
            <div className="settings-fields">
              <FormField
                error={errors.legalName?.message}
                label="Legal name"
                registration={register("legalName")}
              />
              <FormField
                error={errors.registeredAddress?.message}
                label="Registered address"
                multiline
                multilineRows={5}
                registration={register("registeredAddress")}
              />
              <FormField
                error={errors.companyNumber?.message}
                label="Company number"
                registration={register("companyNumber")}
              />
              <FormField
                error={errors.vatRegistrationNumber?.message}
                label="VAT registration number"
                registration={register("vatRegistrationNumber")}
              />
              <FormField
                error={errors.standardVatRate?.message}
                label="Standard VAT rate"
                registration={register("standardVatRate")}
              />
              <FormField
                error={errors.businessTimezone?.message}
                label="Business timezone"
                registration={register("businessTimezone")}
              />
            </div>
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>Bank details</legend>
            <div className="settings-fields settings-fields--bank">
              <FormField
                error={errors.bankName?.message}
                label="Bank name"
                registration={register("bankName")}
              />
              <FormField
                error={errors.sortCode?.message}
                label="Sort code"
                registration={register("sortCode")}
              />
              <FormField
                error={errors.accountNumber?.message}
                label="Account number"
                registration={register("accountNumber")}
              />
            </div>
          </fieldset>

          <section className="wordmark-setting" aria-labelledby="wordmark-heading">
            <div>
              <p className="field-label" id="wordmark-heading">
                Invoice wordmark
              </p>
              <p>The approved Codernetic wordmark is fixed for every document.</p>
            </div>
            <div className="paper-wordmark" aria-label="Codernetic">
              <span>CODER</span>
              <strong>NETIC</strong>
            </div>
          </section>

          <div className="settings-actions">
            <button className="primary-action" type="submit">
              {saveStatus === "error" ? "Retry" : "Save now"}
            </button>
            {saveStatus === "error" ? (
              <p className="save-error">
                Could not save issuer settings. Your edits are still here.
              </p>
            ) : null}
          </div>
        </form>

        <DatasetBackupCard />
      </div>
      <p className="app-version">Invoice Generator {appVersion}</p>
    </>
  );
}
