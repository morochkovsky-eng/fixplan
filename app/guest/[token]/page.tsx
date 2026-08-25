import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function GuestInspectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Задание мастеру</CardTitle>
          <CardDescription>
            Гостевой доступ будет открывать план, выбранные узлы и форму отчета.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="m-0 text-muted-foreground text-sm">
            Токен доступа: <span className="font-mono">{token}</span>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
