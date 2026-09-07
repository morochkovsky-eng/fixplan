import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const DEFAULT_APARTMENT_ID = "00000000-0000-4000-8000-000000000034";
export const APARTMENT_COOKIE = "fixplan_apartment_id";

function validUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export async function getSelectedApartmentId() {
  const cookieStore = await cookies();
  const selected = cookieStore.get(APARTMENT_COOKIE)?.value;
  return validUuid(selected) ? selected! : DEFAULT_APARTMENT_ID;
}

export async function requireApartmentAccess() {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return { admin: null, userId: "", userEmail: "", role: "", error: "Supabase is not configured", status: 500 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { admin, userId: "", userEmail: "", role: "", error: "Unauthorized", status: 401 };
  }

  const apartmentId = await getSelectedApartmentId();

  const { data: membership, error: membershipError } = await admin
    .from("apartment_members")
    .select("role")
    .eq("apartment_id", apartmentId)
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
    .maybeSingle();

  if (membershipError) {
    return { admin, apartmentId, userId: user.id, userEmail: user.email, role: "", error: membershipError.message, status: 500 };
  }

  if (!membership) {
    const { data: fallback, error: fallbackError } = await admin
      .from("apartment_members")
      .select("apartment_id,role")
      .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallbackError || !fallback) {
      return { admin, apartmentId, userId: user.id, userEmail: user.email, role: "", error: fallbackError?.message ?? "Apartment access denied", status: fallbackError ? 500 : 403 };
    }
    return { admin, apartmentId: fallback.apartment_id, userId: user.id, userEmail: user.email, role: fallback.role, error: "", status: 200 };
  }

  return { admin, apartmentId, userId: user.id, userEmail: user.email, role: membership.role, error: "", status: 200 };
}
