import Link from "next/link";
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
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="sticky top-0 z-20 border-b border-stone-300 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Link href="/app" className="group">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-stone-500">
                Private Edition
              </p>
              <h1 className="font-serif text-3xl font-black leading-none text-stone-950">
                YT Newsletter
              </h1>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <CreatorDropdown creators={creators} />
              <span className="text-sm text-stone-600">{user.username}</span>
              <form action={logoutAction}>
                <button className="btn-secondary h-10" type="submit">
                  Logout
                </button>
              </form>
            </div>
          </div>
          <AppNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
