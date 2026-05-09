import Link from "next/link";
import { LogOut } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { CreatorDropdown } from "@/components/creator-dropdown";
import { logoutAction } from "@/app/logout/actions";
import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const creators = await getCreatorsForUser(user.id);

  return (
    <div className="min-h-screen text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[94rem] flex-col gap-3 px-4 py-3 md:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <Link href="/app" className="group inline-flex shrink-0 items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-md border-2 border-blue-600 bg-blue-50 text-lg font-black text-blue-700">
                  Y
                </span>
                <h1 className="whitespace-nowrap text-xl font-black tracking-tight text-slate-950">
                  YT Newsletter
                </h1>
              </Link>
              <AppNav />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <CreatorDropdown creators={creators} />
              <span className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-slate-600">{user.username}</span>
              <form action={logoutAction}>
                <button className="btn-secondary h-10" type="submit">
                  Logout
                  <LogOut aria-hidden className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[94rem] px-4 py-6 md:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
