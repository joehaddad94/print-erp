/** "Open in Maps · " before a click-to-edit map link (prototype Details panels). */
export function MapPinLink({ href }: { href: string }) {
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-tap items-center font-medium text-action hover:underline lg:min-h-6"
      >
        Open in Maps
      </a>
      <span className="text-ink-muted"> · </span>
    </>
  );
}
