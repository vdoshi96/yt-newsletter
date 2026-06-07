"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type DateKeyboardNavigationProps = {
  previousHref: string;
  nextHref: string;
};

export function DateKeyboardNavigation({
  previousHref,
  nextHref,
}: DateKeyboardNavigationProps) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        router.push(previousHref, { scroll: false });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        router.push(nextHref, { scroll: false });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextHref, previousHref, router]);

  return null;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])',
    ),
  );
}
