import { z } from "zod";

export const restoreIdSchema = z.uuid().brand<"RestoreId">();

export type RestoreId = z.infer<typeof restoreIdSchema>;
export type RestoreCleanup = "complete" | "restart-required";
