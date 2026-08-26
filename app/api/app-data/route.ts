import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const APARTMENT_ID = "00000000-0000-4000-8000-000000000034";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await admin
    .from("apartment_members")
    .select("role")
    .eq("apartment_id", APARTMENT_ID)
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Apartment access denied" }, { status: 403 });
  }

  const [assetsResult, eventsResult, inspectionsResult, resultsResult] = await Promise.all([
    admin.from("assets").select("*").eq("apartment_id", APARTMENT_ID).order("code"),
    admin.from("events").select("*").eq("apartment_id", APARTMENT_ID).order("created_at", { ascending: false }),
    admin.from("inspections").select("*").eq("apartment_id", APARTMENT_ID).order("created_at", { ascending: false }),
    admin.from("inspection_results").select("*").eq("apartment_id", APARTMENT_ID).order("created_at", { ascending: false }),
  ]);

  const error =
    assetsResult.error ?? eventsResult.error ?? inspectionsResult.error ?? resultsResult.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return NextResponse.json({
    assets: (assetsResult.data ?? []).map((asset) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      roomId: asset.room_id,
      category: asset.category,
      kind: asset.kind,
      status: asset.status,
      x: Number(asset.x),
      y: Number(asset.y),
      lastChecked: asset.last_checked,
      warrantyUntil: asset.warranty_until,
      master: asset.master,
      photoNote: asset.photo_note,
    })),
    events: (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      assetId: event.asset_id,
      inspectionId: event.inspection_id,
      type: event.type,
      date: event.date_label,
      title: event.title,
      body: event.body,
      cost: event.cost ? Number(event.cost) : undefined,
      master: event.master,
      statusAfter: event.status_after,
      photo: event.photo,
    })),
    inspections: (inspectionsResult.data ?? []).map((inspection) => ({
      id: inspection.id,
      number: inspection.number,
      title: inspection.title,
      createdAt: inspection.created_at_label,
      completedAt: inspection.completed_at_label,
      createdBy: inspection.created_by,
      contractor: inspection.contractor,
      contractorPhone: inspection.contractor_phone,
      scope: inspection.scope,
      status: inspection.status,
      allowedAssetIds: inspection.allowed_asset_ids,
      summary: inspection.summary,
      conclusion: inspection.conclusion,
      link: `${appUrl.replace(/\/$/, "")}/guest/${inspection.guest_token}`,
      resultIds: inspection.result_ids,
    })),
    inspectionResults: (resultsResult.data ?? []).map((result) => ({
      id: result.id,
      inspectionId: result.inspection_id,
      assetId: result.asset_id,
      statusAfter: result.status_after,
      comment: result.comment,
      date: result.date_label,
      author: result.author,
      cost: result.cost ? Number(result.cost) : undefined,
      photoCount: result.photo_count,
    })),
  });
}
