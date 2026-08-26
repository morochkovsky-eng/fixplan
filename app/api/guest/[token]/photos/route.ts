import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const assetId = String(formData.get("assetId") ?? "");
  const file = formData.get("file");

  if (!assetId || !(file instanceof File)) {
    return NextResponse.json({ error: "Asset and file are required" }, { status: 400 });
  }

  const { data: inspection, error: inspectionError } = await admin
    .from("inspections")
    .select("*")
    .eq("guest_token", token)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  if (!inspection || !(inspection.allowed_asset_ids ?? []).includes(assetId)) {
    return NextResponse.json({ error: "Asset is not included in this inspection" }, { status: 403 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${inspection.apartment_id}/${assetId}/${inspection.id}/${randomUUID()}.${extension}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("asset-media")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: mediaError } = await admin.from("asset_media").insert({
    apartment_id: inspection.apartment_id,
    asset_id: assetId,
    event_id: null,
    storage_path: storagePath,
    caption: file.name,
    created_by: inspection.contractor,
  });

  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  const { count } = await admin
    .from("asset_media")
    .select("id", { count: "exact", head: true })
    .eq("apartment_id", inspection.apartment_id)
    .eq("asset_id", assetId)
    .like("storage_path", `${inspection.apartment_id}/${assetId}/${inspection.id}/%`);

  await admin
    .from("inspection_results")
    .update({ photo_count: count ?? 1 })
    .eq("apartment_id", inspection.apartment_id)
    .eq("inspection_id", inspection.id)
    .eq("asset_id", assetId);

  return NextResponse.json({
    ok: true,
    path: storagePath,
    photoCount: count ?? 1,
  });
}
