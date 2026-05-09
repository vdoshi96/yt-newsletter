"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUsernamePassword } from "@/lib/auth/login";

export async function loginAction(formData: FormData) {
  const headerStore = await headers();
  const result = await authenticateUsernamePassword({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip"),
  });

  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/app");
}
