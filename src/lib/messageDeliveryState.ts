// The worker preserves a dispatch marker on ambiguous failures. Do not confuse
// those records with an explicit provider rejection that is safe to retry.
export const UNCERTAIN_DELIVERY_FILTER = "status.eq.uncertain,and(status.eq.failed,dispatch_started_at.not.is.null)";
export const OUTSTANDING_DELIVERY_FILTER = "status.in.(pending,processing,uncertain),and(status.eq.failed,dispatch_started_at.not.is.null)";

export function hasUncertainDelivery(message: { status: string; dispatch_started_at?: string | null }): boolean {
  return message.status === "uncertain" || (message.status === "failed" && !!message.dispatch_started_at);
}
