export type BulkJobRecoveryDecision =
  | { kind: "redirect_orders" }
  | { kind: "review" }
  | { kind: "resume_polling" }
  | { kind: "clear_pending" };

export function resolveBulkJobRecovery(data: unknown): BulkJobRecoveryDecision {
  const status = data && typeof data === "object" && "status" in data
    ? String((data as { status?: unknown }).status || "")
    : "";

  if (status === "processed") return { kind: "redirect_orders" };
  if (status === "completed") return { kind: "review" };
  if (["processing", "processing_orders", "uploaded", "validating"].includes(status)) {
    return { kind: "resume_polling" };
  }
  if (status === "failed") return { kind: "clear_pending" };
  return { kind: "resume_polling" };
}
