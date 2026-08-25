"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase пока не подключен: заполните переменные окружения.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в FixPlan</CardTitle>
          <CardDescription>Закрытый доступ к квартире Шпалерная, 34Б.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            autoComplete="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="email"
            type="email"
            value={email}
          />
          <Input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            placeholder="пароль"
            type="password"
            value={password}
          />
          <Button disabled={loading} onClick={signIn} type="button">
            {loading ? "Входим..." : "Войти"}
          </Button>
          {message && <p className="m-0 text-muted-foreground text-sm">{message}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
