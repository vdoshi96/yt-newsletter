"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Creator } from "@/lib/types";

export function CreatorDropdown({ creators }: { creators: Creator[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("creatorId") ?? creators[0]?.id ?? "";

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-700">
      <span className="hidden sm:inline">Creator</span>
      <select
        className="h-10 max-w-56 rounded border border-stone-300 bg-white px-3 text-sm text-stone-950 shadow-sm"
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
              {creator.title ?? creator.handle ?? "Untitled creator"}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
