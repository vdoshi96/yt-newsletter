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
      <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
        <div className="ink-panel max-w-md text-center">
          <h1 className="font-serif text-3xl font-black">Already signed in</h1>
          <Link className="mt-6 inline-flex btn-primary" href="/app">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#f8f4e8,#e6dfcf_42%,#d5c7aa)] p-6">
      <section className="w-full max-w-md border-4 border-double border-stone-900 bg-paper p-8 shadow-2xl">
        <p className="text-center text-xs font-black uppercase tracking-[0.28em] text-stone-500">
          YT Newsletter
        </p>
        <h1 className="mt-4 text-center font-serif text-4xl font-black text-stone-950">
          Sign in
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-stone-600">
          Private dashboard access. No public signup is enabled by default.
        </p>

        {params.error ? (
          <p className="mt-5 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {params.error}
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-stone-800">
            Username
            <input
              className="mt-2 h-12 w-full rounded border border-stone-300 bg-white px-3 text-stone-950"
              name="username"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-bold text-stone-800">
            Password
            <input
              className="mt-2 h-12 w-full rounded border border-stone-300 bg-white px-3 text-stone-950"
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
