import { Play, RefreshCw } from "lucide-react";
import { runIngestNowAction, seedBaselineAction } from "@/app/app/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/current-user";
import { requiredExternalEnvVars } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const envStatus = requiredExternalEnvVars.map((name) => ({
    name,
    present:
      Boolean(process.env[name]) ||
      (name === "NEXT_PUBLIC_SUPABASE_ANON_KEY" &&
        Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)),
  }));

  return (
    <div className="space-y-6">
      <section className="newspaper-sheet">
        <p className="section-kicker">Settings</p>
        <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Operations and environment
        </h2>
        <p className="mt-4 max-w-3xl text-slate-600">
          Secret values are never printed here. This page only shows whether required
          variable names are present at runtime.
        </p>
      </section>

      {params.error ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {params.error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="ink-panel">
          <h3 className="section-kicker">One-month baseline</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Queue Nate B. Jones&apos;s four most recent completed Saturday-through-Friday
            weeks and seed the first four weekly editions for the baseline website.
            Later weeks stay in the archive.
          </p>
          <form action={seedBaselineAction} className="mt-5">
            <SubmitButton className="btn-primary h-11 justify-center">
              <Play aria-hidden className="size-4" />
              Seed past month baseline
            </SubmitButton>
          </form>
        </div>
        <div className="ink-panel">
          <h3 className="section-kicker">Manual refresh</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This checks YouTube for newly published videos, queues anything missing, and then
            runs the same server-side queue processor used by cron.
          </p>
          <form action={runIngestNowAction} className="mt-5">
            <SubmitButton className="btn-primary h-11 justify-center" >
              <RefreshCw aria-hidden className="size-4" />
              Refresh and run now
            </SubmitButton>
          </form>
          {user.role !== "admin" ? (
            <p className="mt-3 text-sm text-slate-600">Only admins can run this action.</p>
          ) : null}
        </div>
        <div className="ink-panel lg:col-span-2">
          <h3 className="section-kicker">Required env names</h3>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {envStatus.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-4 py-3">
                <span className="font-mono text-xs text-slate-700">{item.name}</span>
                <span className={item.present ? "font-bold text-green-700" : "font-bold text-red-700"}>
                  {item.present ? "present" : "missing"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
