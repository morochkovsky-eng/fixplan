import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningPayload, serializeCleaning } from "@/app/api/cleanings/helpers";

type CreateCleaningInput = {
  apartmentId: string;
  createdBy: string;
  appOrigin: string;
  payload: Record<string, unknown>;
};

export async function createCleaningRecord(admin: SupabaseClient, input: CreateCleaningInput) {
  const normalized = cleaningPayload(input.payload);
  if ("error" in normalized) return { error: normalized.error, status: 400 as const };

  const { data, error } = await admin
    .from("cleanings")
    .insert({
      apartment_id: input.apartmentId,
      id: `clean-${randomUUID().slice(0, 8)}`,
      created_by: input.createdBy,
      created_at_label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
      guest_token: randomBytes(24).toString("hex"),
      ...normalized.row,
    })
    .select("*")
    .single();

  if (error) return { error: error.message, status: 500 as const };

  const cleaning = serializeCleaning(data, input.appOrigin);
  return { cleaning, row: data };
}
