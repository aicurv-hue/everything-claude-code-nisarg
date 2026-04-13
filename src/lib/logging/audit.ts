/**
 * Structured audit logging for admin operations.
 * Writes to Firestore `audit_logs` collection — fire-and-forget, never blocks responses.
 *
 * Required for incident investigation and compliance.
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type AuditAction =
  | "admin.users.list"
  | "admin.users.view"
  | "admin.users.disable"
  | "admin.users.delete"
  | "admin.beta.add"
  | "admin.beta.remove"
  | "admin.beta.list"
  | "admin.promo.create"
  | "admin.promo.edit"
  | "admin.promo.delete"
  | "admin.promo.list"
  | "admin.migrate.run"
  | "admin.stats.view";

/**
 * Log an admin action. Fire-and-forget — never throws, never blocks the caller.
 */
export function logAdminAction(
  action: AuditAction,
  adminEmail: string,
  targetId?: string,
  metadata?: Record<string, unknown>
): void {
  if (!adminDb) return;
  adminDb.collection("audit_logs").add({
    action,
    admin_email: adminEmail,
    target_id: targetId ?? null,
    metadata: metadata ?? null,
    timestamp: FieldValue.serverTimestamp(),
  }).catch((err) => console.error("[audit] Failed to write audit log:", err));
}
