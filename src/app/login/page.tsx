import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loginAction } from "@/app/login/actions";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  const params = await searchParams;

  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="ink-panel max-w-md text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Already signed in</h1>
          <Link className="mt-6 inline-flex btn-primary" href="/app">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="newspaper-sheet w-full max-w-md">
        <div className="mx-auto flex size-12 items-center justify-center rounded-md border-2 border-blue-600 bg-blue-50 text-xl font-black text-blue-700">
          Y
        </div>
        <p className="mt-5 text-center text-sm font-black text-slate-950">YT Newsletter</p>
        <h1 className="mt-3 text-center text-4xl font-black tracking-tight text-slate-950">
          Sign in
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-600">
          Private dashboard access. No public signup is enabled by default.
        </p>

        {params.error ? (
          <p className="mt-5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {params.error}
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <label className="form-label">
            Username
            <input
              className="field-control mt-2 h-12"
              name="username"
              autoComplete="username"
              required
            />
          </label>
          <label className="form-label">
            Password
            <input
              className="field-control mt-2 h-12"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <SubmitButton className="btn-primary h-12 w-full justify-center">
            Sign in
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
