"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { startIngestForCreatorUrl } from "@/lib/creators";

export async function startIngestAction(formData: FormData) {
  const user = await requireUser();
  const creatorUrl = String(formData.get("creatorUrl") ?? "").trim();
  const requestedCount = Number(formData.get("requestedCount") ?? 5);

  if (!creatorUrl) {
    redirect("/app/creators?error=Paste%20a%20YouTube%20creator%20or%20video%20URL");
  }

  let result: Awaited<ReturnType<typeof startIngestForCreatorUrl>>;
  try {
    result = await startIngestForCreatorUrl({
      userId: user.id,
      creatorUrl,
      requestedCount,
    });
  } catch (error) {
    redirect(`/app/creators?error=${encodeURIComponent((error as Error).message)}`);
  }

  const warning = result.warning ? `&warning=${encodeURIComponent(result.warning)}` : "";
  redirect(`/app/jobs?started=${result.jobId}${warning}`);
}
