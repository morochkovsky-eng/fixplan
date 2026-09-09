"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-muted p-4">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle>Не удалось открыть экран</CardTitle>
          <CardDescription>
            Повторите попытку. Введённые данные останутся в системе, если уже успели сохраниться.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} type="button">Повторить</Button>
        </CardContent>
      </Card>
    </main>
  );
}
