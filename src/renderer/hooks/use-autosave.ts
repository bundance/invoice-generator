import { useCallback, useEffect, useRef, useState } from "react";

type SaveStatus = "not-saved" | "saving" | "saved" | "error";

export type AutosaveRequestResult<SavedValue> =
  | Readonly<{ kind: "saved"; value: SavedValue }>
  | Readonly<{ kind: "failed" }>;

type PreparedInput<Input> =
  | Readonly<{ kind: "ready"; input: Input }>
  | Readonly<{ kind: "invalid" }>;

export type AutosavePolicy<Input, SavedValue> = Readonly<{
  inputFromSavedValue: (savedValue: SavedValue) => Input;
  inputMatchesSavedValue: (input: Input, savedValue: SavedValue | null) => boolean;
  onInputCanonicalized: (input: Input) => void;
  onSaved: (savedValue: SavedValue) => void;
  prepareInput: (input: Input) => PreparedInput<Input>;
  requestSave: (input: Input) => Promise<AutosaveRequestResult<SavedValue>>;
}>;

type AutosaveOptions<Input, SavedValue> = Readonly<{
  initialInput: Input;
  initialSavedValue: SavedValue | null;
  initialStatus: SaveStatus;
  policy: AutosavePolicy<Input, SavedValue>;
}>;

type CurrentValue<Value> = { current: Value };

type SaveNowOptions = Readonly<{
  retryAfterInFlightFailure?: boolean;
}>;

type AutosaveContext<Input, SavedValue> = Readonly<{
  activeSave: CurrentValue<Promise<void> | null>;
  currentInput: CurrentValue<Input>;
  generation: CurrentValue<number>;
  pendingInput: CurrentValue<boolean>;
  policy: CurrentValue<AutosavePolicy<Input, SavedValue>>;
  savedValue: CurrentValue<SavedValue | null>;
  setStatus: (status: SaveStatus) => void;
  timeout: CurrentValue<number | null>;
  writeFailed: CurrentValue<boolean>;
}>;

export function useAutosave<Input, SavedValue>({
  initialInput,
  initialSavedValue,
  initialStatus,
  policy,
}: AutosaveOptions<Input, SavedValue>) {
  const [status, setStatus] = useState<SaveStatus>(initialStatus);
  const context = useRef<AutosaveContext<Input, SavedValue>>({
    activeSave: { current: null },
    currentInput: { current: initialInput },
    generation: { current: 0 },
    pendingInput: { current: false },
    policy: { current: policy },
    savedValue: { current: initialSavedValue },
    setStatus,
    timeout: { current: null },
    writeFailed: { current: false },
  });

  const saveLatestInput = useCallback(
    (input: Input) => flushLatestInput(context.current, input),
    [],
  );
  const queue = useCallback(
    (input: Input) => queueInput(context.current, input, saveLatestInput),
    [saveLatestInput],
  );
  const saveNow = useCallback(
    (input: Input, options?: SaveNowOptions) =>
      saveInputNow(context.current, input, saveLatestInput, options),
    [saveLatestInput],
  );
  const retry = useCallback(
    () => retryLatestInput(context.current, saveLatestInput),
    [saveLatestInput],
  );
  const cancel = useCallback(() => cancelAutosave(context.current), []);
  const reset = useCallback(
    (input: Input, savedValue: SavedValue | null, nextStatus: SaveStatus) =>
      resetAutosave(context.current, input, savedValue, nextStatus),
    [],
  );
  const markError = useCallback(() => markAutosaveError(context.current), []);

  useEffect(() => {
    context.current.policy.current = policy;
  }, [policy]);
  useEffect(() => () => cancelAutosave(context.current), []);

  return { cancel, markError, queue, reset, retry, saveNow, status };
}

async function flushLatestInput<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  firstInput: Input,
): Promise<void> {
  const activeSave = context.activeSave.current;
  if (activeSave) {
    context.pendingInput.current = true;
    await activeSave;
    return;
  }

  const save = runSaveLoop(context, firstInput);
  const trackedSave = save.finally(() => {
    context.activeSave.current = null;
  });
  context.activeSave.current = trackedSave;
  await trackedSave;
}

async function runSaveLoop<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  firstInput: Input,
): Promise<void> {
  context.writeFailed.current = false;
  let inputToSave = firstInput;
  let saveGeneration = context.generation.current;

  try {
    while (true) {
      context.pendingInput.current = false;
      context.setStatus("saving");
      const result = await context.policy.current.requestSave(inputToSave);
      if (saveGeneration !== context.generation.current) {
        if (!context.pendingInput.current) return;
        saveGeneration = context.generation.current;
        inputToSave = context.currentInput.current;
        continue;
      }
      if (result.kind === "failed") {
        handleSaveFailure(context);
        return;
      }

      context.savedValue.current = result.value;
      context.policy.current.onSaved(result.value);
      const latestInput = context.currentInput.current;
      const preparedInput = context.policy.current.prepareInput(latestInput);
      if (preparedInput.kind === "invalid") {
        context.setStatus("not-saved");
        return;
      }
      if (context.policy.current.inputMatchesSavedValue(latestInput, result.value)) {
        const canonicalInput = context.policy.current.inputFromSavedValue(result.value);
        context.currentInput.current = canonicalInput;
        context.policy.current.onInputCanonicalized(canonicalInput);
        context.setStatus("saved");
        return;
      }
      inputToSave = preparedInput.input;
    }
  } finally {
    context.pendingInput.current = false;
  }
}

function queueInput<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  input: Input,
  saveLatestInput: (input: Input) => Promise<void>,
): void {
  context.currentInput.current = input;
  clearAutosaveTimeout(context);
  const preparedInput = context.policy.current.prepareInput(input);
  if (preparedInput.kind === "invalid") {
    if (!context.writeFailed.current) context.setStatus("not-saved");
    return;
  }
  if (context.activeSave.current) {
    context.pendingInput.current = true;
    context.setStatus("saving");
    return;
  }
  if (context.policy.current.inputMatchesSavedValue(input, context.savedValue.current)) {
    context.writeFailed.current = false;
    context.setStatus("saved");
    return;
  }
  if (context.writeFailed.current) return;

  context.setStatus("saving");
  context.timeout.current = window.setTimeout(() => {
    context.timeout.current = null;
    void saveLatestInput(preparedInput.input);
  }, 350);
}

async function saveInputNow<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  input: Input,
  saveLatestInput: (input: Input) => Promise<void>,
  options: SaveNowOptions = {},
): Promise<boolean> {
  context.currentInput.current = input;
  clearAutosaveTimeout(context);
  context.writeFailed.current = false;
  const activeSave = context.activeSave.current;
  if (activeSave) {
    await activeSave;
    if (context.writeFailed.current && !options.retryAfterInFlightFailure) return false;
  }
  if (context.policy.current.inputMatchesSavedValue(input, context.savedValue.current)) {
    context.setStatus("saved");
    return true;
  }
  const preparedInput = context.policy.current.prepareInput(input);
  if (preparedInput.kind === "invalid") {
    context.setStatus("not-saved");
    return false;
  }
  await saveLatestInput(preparedInput.input);
  return (
    !context.writeFailed.current &&
    context.policy.current.inputMatchesSavedValue(input, context.savedValue.current)
  );
}

function retryLatestInput<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  saveLatestInput: (input: Input) => Promise<void>,
): void {
  context.writeFailed.current = false;
  const preparedInput = context.policy.current.prepareInput(context.currentInput.current);
  if (preparedInput.kind === "invalid") {
    context.setStatus("not-saved");
    return;
  }
  void saveLatestInput(preparedInput.input);
}

function handleSaveFailure<Input, SavedValue>(context: AutosaveContext<Input, SavedValue>): void {
  const latestInputIsDurable = context.policy.current.inputMatchesSavedValue(
    context.currentInput.current,
    context.savedValue.current,
  );
  context.writeFailed.current = !latestInputIsDurable;
  context.setStatus(latestInputIsDurable ? "saved" : "error");
}

function markAutosaveError<Input, SavedValue>(context: AutosaveContext<Input, SavedValue>): void {
  context.writeFailed.current = true;
  context.setStatus("error");
}

function cancelAutosave<Input, SavedValue>(context: AutosaveContext<Input, SavedValue>): void {
  context.generation.current += 1;
  context.pendingInput.current = false;
  clearAutosaveTimeout(context);
}

function resetAutosave<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
  input: Input,
  savedValue: SavedValue | null,
  status: SaveStatus,
): void {
  cancelAutosave(context);
  context.currentInput.current = input;
  context.savedValue.current = savedValue;
  context.writeFailed.current = false;
  context.setStatus(status);
}

function clearAutosaveTimeout<Input, SavedValue>(
  context: AutosaveContext<Input, SavedValue>,
): void {
  if (context.timeout.current === null) return;
  window.clearTimeout(context.timeout.current);
  context.timeout.current = null;
}
