import { CleaningGuestClient } from "./cleaning-guest-client";

export default async function CleaningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CleaningGuestClient token={token} />;
}

