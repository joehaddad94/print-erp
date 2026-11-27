/** "Open in Maps · " before a click-to-edit map link (prototype Details panels). `label` alone = just the link. */
export function MapPinLink({ href, label }: { href: string; label?: string }) {
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-tap items-center font-medium text-action hover:underline lg:min-h-6"
      >
        {label ?? "Open in Maps"}
      </a>
      {label ? null : <span className="text-ink-muted"> · </span>}
    </>
  );
}
