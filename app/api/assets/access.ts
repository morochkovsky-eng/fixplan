import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const APARTMENT_ID = "00000000-0000-4000-8000-000000000034";

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

  const { data: membership, error: membershipError } = await admin
    .from("apartment_members")
    .select("role")
    .eq("apartment_id", APARTMENT_ID)
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
    .maybeSingle();

  if (membershipError || !membership) {
    return { admin, userId: user.id, userEmail: user.email, role: "", error: "Apartment access denied", status: 403 };
  }

  return { admin, userId: user.id, userEmail: user.email, role: membership.role, error: "", status: 200 };
}
