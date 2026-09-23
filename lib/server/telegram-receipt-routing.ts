import type { SupabaseClient } from "@supabase/supabase-js";
import { listTelegramApartments, type TelegramOwnerAccount } from "@/lib/server/telegram-context";

export const defaultReceiptApartmentId = "00000000-0000-4000-8000-000000000034";

export function receiptRoutingMode() {
  return process.env.TELEGRAM_RECEIPT_ROUTING_MODE === "address" ? "address" : "single_apartment";
}

export function configuredReceiptApartmentId() {
  return process.env.TELEGRAM_RECEIPT_APARTMENT_ID?.trim() || defaultReceiptApartmentId;
}

export async function resolveConfiguredReceiptApartment(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
) {
  const available = await listTelegramApartments(admin, account);
  if ("error" in available) return { error: "receipt_apartment_lookup_failed" } as const;
  const configuredId = configuredReceiptApartmentId();
  const apartment = available.apartments.find((item) => item.id === configuredId);
  if (!apartment) return { error: "configured_receipt_apartment_unavailable" } as const;
  return { apartment, mode: "single_apartment" as const };
}
