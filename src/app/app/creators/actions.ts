"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { startIngestForCreatorUrl, startPastMonthBaselineForCreatorUrl } from "@/lib/creators";

export async function startIngestAction(formData: FormData) {
  const user = await requireUser();
  const creatorUrl = String(formData.get("creatorUrl") ?? "").trim();
  const requestedCountValue = String(formData.get("requestedCount") ?? "5");

  if (!creatorUrl) {
    redirect("/app/creators?error=Paste%20a%20YouTube%20creator%20or%20video%20URL");
  }

  let result: Awaited<
    ReturnType<typeof startIngestForCreatorUrl> | ReturnType<typeof startPastMonthBaselineForCreatorUrl>
  >;
  try {
    if (requestedCountValue === "past_month") {
      result = await startPastMonthBaselineForCreatorUrl({
        userId: user.id,
        creatorUrl,
      });
    } else {
      result = await startIngestForCreatorUrl({
        userId: user.id,
        creatorUrl,
        requestedCount: Number(requestedCountValue),
      });
    }
  } catch (error) {
    redirect(`/app/creators?error=${encodeURIComponent((error as Error).message)}`);
  }

  const warningText =
    "discoveryWarning" in result ? result.discoveryWarning : result.warning;
  const warning = warningText ? `&warning=${encodeURIComponent(warningText)}` : "";
  redirect(`/app/jobs?started=${result.jobId}${warning}`);
}
