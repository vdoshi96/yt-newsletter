import { Plus, RadioTower } from "lucide-react";
import { startIngestAction } from "@/app/app/creators/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";

export const dynamic = "force-dynamic";

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; warning?: string }>;
}) {
  const user = await requireUser();
  const [creators, params] = await Promise.all([getCreatorsForUser(user.id), searchParams]);

  return (
    <div className="space-y-8">
      <section className="newspaper-sheet">
        <p className="section-kicker">Creator desk</p>
        <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Add a creator and backfill videos
        </h2>
        <p className="mt-4 max-w-3xl text-slate-600">
          Paste a channel, handle, user, custom, or video URL. Discovery uses the YouTube
          Data API when available; RSS fallback is limited to channel IDs.
        </p>

        {params.error ? <Alert tone="error" message={params.error} /> : null}
        {params.warning ? <Alert tone="warn" message={params.warning} /> : null}

        <form action={startIngestAction} className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_auto]">
          <label className="form-label">
            YouTube URL
            <input
              className="field-control mt-2 h-12"
              name="creatorUrl"
              placeholder="https://www.youtube.com/@NateBJones"
              required
            />
          </label>
          <label className="form-label">
            Backfill
            <select
              className="field-control mt-2 h-12"
              name="requestedCount"
              defaultValue="past_month"
            >
              <option value="past_month">Past month</option>
              {[5, 10, 25, 50].map((count) => (
                <option key={count} value={count}>
                  {count} videos
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <SubmitButton className="btn-primary h-12 w-full justify-center">
              <Plus aria-hidden className="size-4" />
              Start baseline
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="ink-panel">
        <h3 className="section-kicker">Subscribed creators</h3>
        <div className="mt-4 divide-y divide-slate-100">
          {creators.length === 0 ? (
            <p className="py-4 text-sm text-slate-600">
              No creators yet. Nate B. Jones is added by `npm run seed:creator`, and
              the one-month baseline is queued with `npm run seed:baseline`.
            </p>
          ) : (
            creators.map((creator) => (
              <div key={creator.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    <RadioTower aria-hidden className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-black text-slate-950">{creator.title}</p>
                    <p className="truncate text-sm text-slate-600">{creator.channel_url}</p>
                  </div>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  {creator.youtube_channel_id ? "YouTube API ready" : "Handle seeded"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Alert({ tone, message }: { tone: "error" | "warn"; message: string }) {
  return (
    <p
      className={`mt-5 rounded-md border p-3 text-sm ${
        tone === "error"
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      {message}
    </p>
  );
}
