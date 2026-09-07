import type { SupabaseClient } from "@supabase/supabase-js";

export type TelegramOwnerAccount = {
  telegram_user_id: number | string;
  owner_user_id: string;
  owner_email: string;
  default_apartment_id: string;
  display_name: string;
};

export type TelegramApartment = {
  id: string;
  name: string;
  address: string;
};

type TelegramApartmentListResult =
  | { apartments: TelegramApartment[] }
  | { error: string };

type TelegramApartmentResult =
  | { apartment: TelegramApartment; apartments: TelegramApartment[] }
  | { error: string };

export async function listTelegramApartments(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
): Promise<TelegramApartmentListResult> {
  const apartmentIds = new Set<string>();
  const byUser = await admin
    .from("apartment_members")
    .select("apartment_id")
    .eq("user_id", account.owner_user_id)
    .in("role", ["owner", "admin"]);

  if (byUser.error) return { error: byUser.error.message };
  for (const membership of byUser.data ?? []) apartmentIds.add(membership.apartment_id);

  if (account.owner_email) {
    const byEmail = await admin
      .from("apartment_members")
      .select("apartment_id")
      .ilike("email", account.owner_email)
      .in("role", ["owner", "admin"]);
    if (byEmail.error) return { error: byEmail.error.message };
    for (const membership of byEmail.data ?? []) apartmentIds.add(membership.apartment_id);
  }

  if (!apartmentIds.size) return { apartments: [] };
  const { data, error } = await admin
    .from("apartments")
    .select("id,name,address")
    .in("id", [...apartmentIds])
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  return { apartments: (data ?? []) as TelegramApartment[] };
}

export async function resolveTelegramApartment(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
  requestedApartmentId?: string | null,
): Promise<TelegramApartmentResult> {
  const result = await listTelegramApartments(admin, account);
  if ("error" in result) return result;
  const selectedId = requestedApartmentId || account.default_apartment_id;
  const apartment =
    result.apartments.find((item) => item.id === selectedId) ?? result.apartments[0];
  if (!apartment) return { error: "У аккаунта нет доступных объектов." };
  return { apartment, apartments: result.apartments };
}

export async function getActiveTelegramApartment(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
): Promise<TelegramApartmentResult> {
  const { data, error } = await admin
    .from("telegram_conversations")
    .select("active_apartment_id")
    .eq("telegram_user_id", account.telegram_user_id)
    .maybeSingle();
  if (error) return { error: error.message };
  return resolveTelegramApartment(admin, account, data?.active_apartment_id);
}
