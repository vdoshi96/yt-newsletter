"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { processIngestQueue } from "@/lib/processor";
import { startPastMonthBaselineForCreatorUrl } from "@/lib/creators";

export async function runIngestNowAction() {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/app/settings?error=Only%20admins%20can%20run%20the%20manual%20processor");
  }

  const result = await processIngestQueue();
  redirect(`/app/jobs?processed=${result.processed}`);
}

export async function seedBaselineAction() {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/app/settings?error=Only%20admins%20can%20seed%20the%20baseline");
  }

  const result = await startPastMonthBaselineForCreatorUrl({
    userId: user.id,
    creatorUrl: "https://www.youtube.com/@NateBJones",
  });

  redirect(`/app/jobs?started=${result.jobId}`);
}
