import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../assets/access";

async function manager() {
  const access = await requireApartmentAccess();
  if (access.error || !access.admin)
    return {
      response: NextResponse.json(
        { error: access.error || "Нет доступа." },
        { status: access.status },
      ),
    } as const;
  if (!["owner", "admin"].includes(access.role))
    return {
      response: NextResponse.json(
        {
          error: "Подключать группу может владелец или администратор квартиры.",
        },
        { status: 403 },
      ),
    } as const;
  return { access } as const;
}
export async function GET() {
  const result = await manager();
  if (result.response) return result.response;
  const { admin, apartmentId, userId } = result.access;
  const [
    { data: group, error },
    { data: account },
    { data: apartment },
    { data: last },
  ] = await Promise.all([
    admin
      .from("telegram_apartment_groups")
      .select("title,connected_at")
      .eq("apartment_id", apartmentId)
      .maybeSingle(),
    admin
      .from("telegram_accounts")
      .select("telegram_user_id")
      .eq("owner_user_id", userId)
      .eq("active", true)
      .maybeSingle(),
    admin.from("apartments").select("name").eq("id", apartmentId).single(),
    admin
      .from("telegram_statement_deliveries")
      .select("period,sent_at,group_title")
      .eq("apartment_id", apartmentId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error)
    return NextResponse.json(
      { error: "Не удалось загрузить подключение группы." },
      { status: 500 },
    );
  return NextResponse.json({
    apartmentId,
    apartmentName: apartment?.name,
    group,
    personalConnected: !!account,
    lastDelivery: last,
  });
}
export async function POST(request: Request) {
  const result = await manager();
  if (result.response) return result.response;
  const { admin, apartmentId, userId } = result.access;
  const body = await request.json().catch(() => ({}));
  if (body.apartmentId !== apartmentId)
    return NextResponse.json(
      { error: "Квартира изменилась. Обновите настройки." },
      { status: 409 },
    );
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username)
    return NextResponse.json(
      { error: "Подключение бота временно недоступно." },
      { status: 503 },
    );
  const { data: account, error: accountError } = await admin
    .from("telegram_accounts")
    .select("telegram_user_id")
    .eq("owner_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (accountError || !account)
    return NextResponse.json(
      { error: "Сначала подключите личный Telegram в блоке выше." },
      { status: 400 },
    );
  const code = `group_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("telegram_group_pairings")
    .insert({
      code_hash: createHash("sha256").update(code).digest("hex"),
      apartment_id: apartmentId,
      owner_user_id: userId,
      telegram_user_id: account.telegram_user_id,
      expires_at: expiresAt,
    });
  if (error)
    return NextResponse.json(
      { error: "Не удалось создать ссылку подключения." },
      { status: 500 },
    );
  return NextResponse.json({
    link: `https://t.me/${username}?startgroup=${code}`,
    expiresAt,
  });
}
export async function DELETE(request: Request) {
  const result = await manager();
  if (result.response) return result.response;
  const { admin, apartmentId } = result.access;
  const body = await request.json().catch(() => ({}));
  if (body.apartmentId !== apartmentId)
    return NextResponse.json(
      { error: "Квартира изменилась. Обновите настройки." },
      { status: 409 },
    );
  const { error } = await admin
    .from("telegram_apartment_groups")
    .delete()
    .eq("apartment_id", apartmentId);
  if (error)
    return NextResponse.json(
      { error: "Не удалось отключить группу." },
      { status: 500 },
    );
  await admin
    .from("telegram_group_pairings")
    .delete()
    .eq("apartment_id", apartmentId);
  await admin
    .from("telegram_statement_deliveries")
    .update({ status: "cancelled" })
    .eq("apartment_id", apartmentId)
    .eq("status", "prepared");
  return NextResponse.json({ ok: true });
}
