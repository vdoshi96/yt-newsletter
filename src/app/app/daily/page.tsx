import Link from "next/link";
import { CalendarDays, RotateCcw } from "lucide-react";
import { DigestArchiveNavigation } from "@/components/digest-archive-navigation";
import { DateKeyboardNavigation } from "@/components/date-keyboard-navigation";
import { DigestRenderer } from "@/components/digest-renderer";
import { requireUser } from "@/lib/auth/current-user";
import { getCatalogStartDate } from "@/lib/catalog";
import { getCreatorsForUser } from "@/lib/creators";
import { getAdjacentArchiveValue } from "@/lib/digests/navigation";
import { dailyDigestSchema } from "@/lib/digests/schemas";
import { getDailyVideoPickerState, selectDailyDigestForDate } from "@/lib/digests/selection";
import { isGroundedDailyDigestRow } from "@/lib/digests/rendering";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";
const MAIN_VIDEO_MIN_SECONDS = 300;

type DailyRow = {
  id: string;
  video_id: string;
  digest_date: string;
  title: string;
  video_title: string | null;
  grounding_status: string | null;
  processing_status: string | null;
  transcript_source: string | null;
  transcript_length: number | null;
  generation_model: string | null;
  generated_at: string | null;
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
  const availableDates = [...new Set(digests.map((digest) => digest.digest_date))].sort();
  const selectedDate =
    params.date ?? availableDates.at(-1) ?? new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const selectedDateHref = buildDigestHref("/app/daily", { creatorId, date: selectedDate });
  const previousDate = getAdjacentArchiveValue(selectedDate, availableDates, -1);
  const nextDate = getAdjacentArchiveValue(selectedDate, availableDates, 1);
  const previousDateHref = previousDate
    ? buildDigestHref("/app/daily", { creatorId, date: previousDate })
    : undefined;
  const nextDateHref = nextDate
    ? buildDigestHref("/app/daily", { creatorId, date: nextDate })
    : undefined;
  const picker = getDailyVideoPickerState(digests, selectedDate);
  const selected = selectDailyDigestForDate(
    digests,
    selectedDate,
    params.videoId,
    isGroundedDailyDigestRow,
  );
  const selectedIsGrounded = selected ? isGroundedDailyDigestRow(selected) : false;
  const parsed =
    selected && selectedIsGrounded ? dailyDigestSchema.parse(selected.full_digest_json) : null;

  return (
    <div className="space-y-6">
      <DateKeyboardNavigation
        previousHref={previousDateHref ?? selectedDateHref}
        nextHref={nextDateHref ?? selectedDateHref}
      />
      <section className="ink-panel">
        <div className="mb-4 border-b border-slate-200 pb-4">
          <h1 className="text-xl font-black text-slate-950">Daily digest preview</h1>
          <p className="mt-1 text-sm text-slate-600">
            Select a date and video, then load the stored edition.
          </p>
        </div>
        <DigestArchiveNavigation
          previousHref={previousDateHref}
          previousLabel="Previous digest"
          nextHref={nextDateHref}
          nextLabel="Next digest"
        />
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
      ) : selected ? (
        <BlockedDailyDigest digest={selected} />
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

function buildDigestHref(pathname: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${pathname}?${query.toString()}`;
}

function BlockedDailyDigest({ digest }: { digest: DailyRow }) {
  return (
    <section className="newspaper-sheet">
      <p className="section-kicker">Digest blocked</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        This stored daily row needs grounded regeneration
      </h2>
      <p className="mt-3 max-w-2xl text-slate-600">
        The app is not showing this as final content because the row is missing verified transcript
        grounding metadata or does not meet the transcript threshold.
      </p>
      <dl className="mt-5 grid gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 md:grid-cols-2">
        <div>
          <dt className="font-bold">Status</dt>
          <dd>{digest.processing_status ?? digest.grounding_status ?? "pending"}</dd>
        </div>
        <div>
          <dt className="font-bold">Transcript source</dt>
          <dd>{digest.transcript_source ?? "missing"}</dd>
        </div>
        <div>
          <dt className="font-bold">Transcript length</dt>
          <dd>{(digest.transcript_length ?? 0).toLocaleString()} characters</dd>
        </div>
        <div>
          <dt className="font-bold">Model</dt>
          <dd>{digest.generation_model ?? "not generated"}</dd>
        </div>
      </dl>
    </section>
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
  const catalogStartDate = getCatalogStartDate();
  return sql<DailyRow[]>`
    select
      daily_digests.id,
      daily_digests.video_id,
      daily_digests.digest_date::text as digest_date,
      daily_digests.title,
      videos.title as video_title,
      daily_digests.grounding_status,
      daily_digests.processing_status,
      daily_digests.transcript_source,
      daily_digests.transcript_length,
      daily_digests.generation_model,
      daily_digests.generated_at::text as generated_at,
      daily_digests.full_digest_json
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    join user_creators on user_creators.creator_id = daily_digests.creator_id
    where user_creators.user_id = ${userId}
      and daily_digests.creator_id = ${creatorId}
      and daily_digests.digest_date >= ${catalogStartDate}::date
      and coalesce(videos.duration_seconds, 0) >= ${MAIN_VIDEO_MIN_SECONDS}
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date desc, videos.published_at desc nulls last
  `;
}
