"use client";

import { Link } from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Callout, FileDrop, FormBar, buttonClass } from "@/components/ui";
import { SUPPORTED_SLICERS } from "@/lib/gcode";
import { importRecipeAction } from "@/server/recipes/actions";
import type { BlobUploadFlavor, StorageMode } from "@/server/storage";
import { takeHandedOffFile, uploadGcode } from "./gcode-client";
import { ImportDetails } from "./import-details";
import { useGcodeImport, type ProductOption, type RecipeGroup } from "./use-gcode-import";

/**
 * Import a .gcode as a recipe or a new version of one (D14, D17). The file is read in the
 * browser first, so Joe sees the specs and items before anything is uploaded.
 */
export function ImportForm({
  mode,
  access,
  flavor,
  products,
  tolerance,
  group,
  versionChoices,
}: {
  mode: StorageMode;
  access: "private" | "public";
  flavor: BlobUploadFlavor;
  products: ProductOption[];
  tolerance: { grams: number; pct: number };
  group?: RecipeGroup;
  /** Current recipes, so a new file can be saved as a new version of one. */
  versionChoices?: RecipeGroup[];
}) {
  const router = useRouter();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const imp = useGcodeImport({ tolerance, initialGroup: group });
  const [busy, setBusy] = useState<null | "uploading" | "saving">(null);

  useEffect(() => {
    // Runs once on mount: picks up a file handed over by the cost calculator (an external store),
    // read asynchronously like any other file.
    // Also picks up a file chosen before the page finished loading (slow phones).
    const handed = takeHandedOffFile() ?? fileInput.current?.files?.[0];
    if (handed) void Promise.resolve(handed).then(imp.choose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = imp.ready && !busy;

  async function save() {
    if (!imp.file || !canSave) return;
    imp.setError(null);
    try {
      setBusy("uploading");
      const fileUrl = await uploadGcode(imp.file, mode, access, flavor);
      setBusy("saving");
      const res = await importRecipeAction(imp.payload(fileUrl));
      if (res.saved) {
        router.push(`/recipes/${res.saved.id}`);
        return;
      }
      imp.setDuplicate(res.duplicateOf ?? null);
      imp.setError(res.error ?? "Couldn't save.");
    } catch {
      imp.setError("The upload failed. Nothing was saved. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const status = imp.reading
    ? "reading…"
    : imp.parsed
      ? `${imp.parsed.slicerName ?? "Unknown slicer"} · read OK`
      : imp.error
        ? "couldn't read it"
        : undefined;

  return (
    <div className="flex flex-col gap-4">
      <FileDrop
        ref={fileInput}
        id={fileId}
        label="G-code file"
        accept=".gcode"
        file={imp.file}
        status={status}
        hint={`Plain .gcode exported from ${SUPPORTED_SLICERS}.`}
        onFile={(f) => void imp.choose(f)}
      />
      {imp.error ? <Callout tone="danger">{imp.error}</Callout> : null}
      {imp.duplicate ? (
        <Callout tone="warning" title="Same file">
          This file is already{" "}
          <Link className="font-semibold underline" href={`/recipes/${imp.duplicate.id}`}>
            {imp.duplicate.name} v{imp.duplicate.version}
          </Link>
          . Nothing to import.
        </Callout>
      ) : null}

      {imp.parsed && !imp.duplicate ? (
        <>
          <ImportDetails imp={imp} idPrefix={fileId} products={products} versionChoices={versionChoices} />
          <FormBar
            primary={
              <Button disabled={!canSave} pending={!!busy} onClick={() => void save()}>
                {busy === "uploading"
                  ? "Uploading…"
                  : busy === "saving"
                    ? "Saving…"
                    : imp.group
                      ? "Save new version"
                      : "Save recipe"}
              </Button>
            }
            secondary={
              <Link href="/recipes" className={buttonClass("secondary")}>
                Cancel
              </Link>
            }
          />
        </>
      ) : null}
    </div>
  );
}
