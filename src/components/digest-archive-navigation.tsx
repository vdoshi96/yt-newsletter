import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type DigestArchiveNavigationProps = {
  previousHref?: string;
  previousLabel: string;
  nextHref?: string;
  nextLabel: string;
};

export function DigestArchiveNavigation({
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
}: DigestArchiveNavigationProps) {
  return (
    <nav
      aria-label="Digest archive navigation"
      className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
    >
      <ArchiveNavigationLink href={previousHref} label={previousLabel} direction="previous" />
      <ArchiveNavigationLink href={nextHref} label={nextLabel} direction="next" />
    </nav>
  );
}

function ArchiveNavigationLink({
  href,
  label,
  direction,
}: {
  href?: string;
  label: string;
  direction: "previous" | "next";
}) {
  const content =
    direction === "previous" ? (
      <>
        <ChevronLeft aria-hidden className="size-4" />
        {label}
      </>
    ) : (
      <>
        {label}
        <ChevronRight aria-hidden className="size-4" />
      </>
    );

  const className = "btn-secondary h-10 justify-center sm:min-w-36";

  if (!href) {
    return (
      <span aria-disabled="true" className={`${className} pointer-events-none opacity-50`}>
        {content}
      </span>
    );
  }

  return (
    <Link className={className} href={href}>
      {content}
    </Link>
  );
}
