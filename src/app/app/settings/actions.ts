"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { processIngestQueue } from "@/lib/processor";

export async function runIngestNowAction() {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/app/settings?error=Only%20admins%20can%20run%20the%20manual%20processor");
  }

  const result = await processIngestQueue();
  redirect(`/app/jobs?processed=${result.processed}`);
}
