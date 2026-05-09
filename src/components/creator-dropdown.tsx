"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Creator } from "@/lib/types";

export function CreatorDropdown({ creators }: { creators: Creator[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("creatorId") ?? creators[0]?.id ?? "";
  const selectedCreator = creators.find((creator) => creator.id === selected) ?? creators[0];
  const initial = (selectedCreator?.title ?? selectedCreator?.handle ?? "C")
    .slice(0, 1)
    .toUpperCase();

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-700 shadow-sm">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
        {initial}
      </span>
      <span className="sr-only">Creator</span>
      <select
        className="h-8 max-w-40 min-w-0 bg-transparent px-1 text-sm font-medium text-slate-950 outline-none"
        value={selected}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("creatorId", event.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {creators.length === 0 ? (
          <option>No creators yet</option>
        ) : (
          creators.map((creator) => (
            <option key={creator.id} value={creator.id}>
              {formatCreatorLabel(creator)}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

function formatCreatorLabel(creator: Creator) {
  const raw = creator.title ?? creator.handle ?? "Untitled creator";
  const label = raw.includes("|") ? raw.split("|").at(-1)?.trim() ?? raw : raw;
  return label.replace("Nate B Jones", "Nate B. Jones");
}
