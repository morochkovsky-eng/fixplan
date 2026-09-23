import type { SupabaseClient } from "@supabase/supabase-js";
import { listTelegramApartments, type TelegramOwnerAccount } from "@/lib/server/telegram-context";

export function receiptRoutingMode() {
  return process.env.TELEGRAM_RECEIPT_ROUTING_MODE === "address" ? "address" : "single_apartment";
}

export function configuredReceiptApartmentId() {
  return process.env.TELEGRAM_RECEIPT_APARTMENT_ID?.trim() || null;
}

export async function resolveConfiguredReceiptApartment(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
) {
  const available = await listTelegramApartments(admin, account);
  if ("error" in available) return { error: "receipt_apartment_lookup_failed" } as const;
  const configuredId = configuredReceiptApartmentId();
  if (!configuredId) return { error: "receipt_apartment_not_configured" } as const;
  const apartment = available.apartments.find((item) => item.id === configuredId);
  if (!apartment) return { error: "configured_receipt_apartment_unavailable" } as const;
  return { apartment, mode: "single_apartment" as const };
}
