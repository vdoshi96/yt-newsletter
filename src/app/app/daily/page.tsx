import Link from "next/link";
import { CalendarDays, RotateCcw } from "lucide-react";
import { DigestRenderer } from "@/components/digest-renderer";
import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";
import { dailyDigestSchema } from "@/lib/digests/schemas";
import { getDailyVideoPickerState } from "@/lib/digests/selection";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type DailyRow = {
  id: string;
  video_id: string;
  digest_date: string;
  title: string;
  video_title: string | null;
  full_digest_json: unknown;
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ creatorId?: string; date?: string; videoId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const creators = await getCreatorsForUser(user.id);
  const creatorId = params.creatorId ?? creators[0]?.id;

  if (!creatorId) {
    return <EmptyPage title="No creators yet" href="/app/creators" action="Add a creator" />;
  }

  const digests = await getDailyDigests(user.id, creatorId);
  const availableDates = [...new Set(digests.map((digest) => digest.digest_date))];
  const selectedDate = params.date ?? availableDates[0] ?? new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const picker = getDailyVideoPickerState(digests, selectedDate);
  const dateDigests = digests.filter((digest) => digest.digest_date === selectedDate);
  const selected =
    dateDigests.find((digest) => digest.video_id === params.videoId) ?? dateDigests[0] ?? null;
  const parsed = selected ? dailyDigestSchema.parse(selected.full_digest_json) : null;

  return (
    <div className="space-y-6">
      <section className="ink-panel">
        <div className="mb-4 border-b border-slate-200 pb-4">
          <h1 className="text-xl font-black text-slate-950">Daily digest preview</h1>
          <p className="mt-1 text-sm text-slate-600">
            Select a date and video, then load the stored edition.
          </p>
        </div>
        <form method="get" className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <input type="hidden" name="creatorId" value={creatorId} />
          <label className="form-label">
            Date
            <input
              className="field-control mt-2"
              name="date"
              type="date"
              defaultValue={selectedDate}
              list="available-digest-dates"
            />
            <datalist id="available-digest-dates">
              {availableDates.map((date) => (
                <option key={date} value={date} />
              ))}
            </datalist>
          </label>
          {picker.shouldShowVideoPicker ? (
            <label className="form-label">
              Video
              <select
                className="field-control mt-2"
                name="videoId"
                defaultValue={selected?.video_id}
              >
                {picker.options.map((option) => (
                  <option key={option.videoId} value={option.videoId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="btn-primary h-11 justify-center">
            <CalendarDays aria-hidden className="size-4" />
            Load edition
          </button>
          <Link
            className="btn-secondary h-11 justify-center"
            href={`/app/daily?creatorId=${creatorId}&date=${today}`}
          >
            <RotateCcw aria-hidden className="size-4" />
            Jump to current
          </Link>
        </form>
      </section>

      {parsed ? (
        <DigestRenderer digest={parsed} />
      ) : (
        <EmptyPage
          title="No daily digest for this date"
          href="/app/creators"
          action="Queue an ingestion"
        />
      )}
    </div>
  );
}

function EmptyPage({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <section className="newspaper-sheet text-center">
      <p className="section-kicker">Empty edition</p>
      <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">
        Daily digests appear after a job discovers the video, prepares source material,
        and stores the edition.
      </p>
      <Link className="mt-6 inline-flex btn-primary" href={href}>
        {action}
      </Link>
    </section>
  );
}

async function getDailyDigests(userId: string, creatorId: string) {
  const sql = getSql();
  return sql<DailyRow[]>`
    select
      daily_digests.id,
      daily_digests.video_id,
      daily_digests.digest_date::text as digest_date,
      daily_digests.title,
      videos.title as video_title,
      daily_digests.full_digest_json
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    join user_creators on user_creators.creator_id = daily_digests.creator_id
    where user_creators.user_id = ${userId}
      and daily_digests.creator_id = ${creatorId}
    order by daily_digests.digest_date desc, videos.published_at desc nulls last
  `;
}
