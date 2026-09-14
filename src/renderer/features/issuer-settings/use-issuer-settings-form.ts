import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, type FormEvent } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";

import {
  emptyIssuerSettingsInput,
  type IssuerSettings,
  type IssuerSettingsInput,
  issuerSettingsAreEqual,
  issuerSettingsFormSchema,
  issuerSettingsToInput,
  validateIssuerSettings,
} from "../../../domain/issuer/issuer-settings.ts";
import { useAutosave, type AutosavePolicy } from "../../hooks/use-autosave.ts";

type UseIssuerSettingsFormOptions = Readonly<{
  issuer: IssuerSettings | null;
  onIssuerSaved: (issuer: IssuerSettings) => void;
}>;

function issuerInputMatchesDurableIssuer(
  input: IssuerSettingsInput,
  durableIssuer: IssuerSettings | null,
): boolean {
  const validation = validateIssuerSettings(input);
  return validation.kind === "valid" && issuerSettingsAreEqual(durableIssuer, validation.issuer);
}

export function useIssuerSettingsForm({ issuer, onIssuerSaved }: UseIssuerSettingsFormOptions) {
  const initialInput = issuer ? issuerSettingsToInput(issuer) : emptyIssuerSettingsInput;
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    subscribe,
  } = useForm<IssuerSettingsInput>({
    defaultValues: initialInput,
    mode: "onTouched",
    reValidateMode: "onChange",
    resolver: zodResolver(issuerSettingsFormSchema, undefined, { mode: "sync", raw: true }),
  });
  const autosavePolicy = useMemo(
    () => createIssuerAutosavePolicy(window.invoiceApp, onIssuerSaved, reset),
    [onIssuerSaved, reset],
  );
  const autosave = useAutosave({
    initialInput,
    initialSavedValue: issuer,
    initialStatus: issuer ? "saved" : "not-saved",
    policy: autosavePolicy,
  });
  const { queue: queueAutosave, saveNow, status: saveStatus } = autosave;

  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ values }) => queueAutosave(values),
      }),
    [queueAutosave, subscribe],
  );

  const saveSubmittedInput = useCallback<SubmitHandler<IssuerSettingsInput>>(
    async (input) => {
      await saveNow(input);
    },
    [saveNow],
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      void handleSubmit(saveSubmittedInput)(event);
    },
    [handleSubmit, saveSubmittedInput],
  );

  return {
    errors,
    register,
    saveStatus,
    submit,
  };
}

export type IssuerSettingsForm = ReturnType<typeof useIssuerSettingsForm>;

function createIssuerAutosavePolicy(
  invoiceApp: typeof window.invoiceApp,
  onIssuerSaved: (issuer: IssuerSettings) => void,
  reset: (input: IssuerSettingsInput) => void,
): AutosavePolicy<IssuerSettingsInput, IssuerSettings> {
  return {
    inputFromSavedValue: issuerSettingsToInput,
    inputMatchesSavedValue: issuerInputMatchesDurableIssuer,
    onInputCanonicalized: reset,
    onSaved: onIssuerSaved,
    prepareInput: (input) =>
      validateIssuerSettings(input).kind === "valid"
        ? { kind: "ready", input }
        : { kind: "invalid" },
    requestSave: async (input) => {
      try {
        const result = await invoiceApp.saveIssuerSettings(input);
        return result.kind === "saved"
          ? { kind: "saved", value: result.issuer }
          : { kind: "failed" };
      } catch {
        return { kind: "failed" };
      }
    },
  };
}
