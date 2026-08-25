import { GuestInspectionClient } from "./guest-inspection-client";

export default async function GuestInspectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <GuestInspectionClient token={token} />;
}
