import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantMessageChannel = "web" | "telegram";

export async function recordAssistantMessage(
  admin: SupabaseClient,
  input: {
    ownerUserId: string;
    apartmentId: string;
    role: "user" | "assistant";
    channel: AssistantMessageChannel;
    content: string;
    attachments?: Array<{ filename: string; mimeType: string; storagePath?: string }>;
  },
) {
  const { error } = await admin.from("assistant_messages").insert({
    owner_user_id: input.ownerUserId,
    apartment_id: input.apartmentId,
    role: input.role,
    channel: input.channel,
    content: input.content,
    attachments: input.attachments ?? [],
  });
  if (error) throw new Error(error.message);
}
