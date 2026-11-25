/** One object (STL) on the plate. `count` = distinct object ids for that STL (D40.2). */
export type PlateObject = {
  /** Name as written in the file, URL-decoded (e.g. "new croix.stl"). */
  rawName: string;
  /** Human label: the STL name without extension, or "Object N" when the name is a hash. */
  displayName: string;
  count: number;
};

export type Thumbnail = { width: number; height: number; base64Png: string };

/** Everything a recipe takes from a .gcode file (D14, D40). All numbers in the units named. */
export type ParsedGcode = {
  parser: string;
  parserVersion: string;
  slicerName: string | null;
  slicerVersion: string | null;
  printerModel: string | null;
  nozzleMm: number | null;
  material: string | null;
  colour: string | null;
  layerHeightMm: number | null;
  totalLayers: number | null;
  totalGrams: number | null;
  totalMm: number | null;
  totalCm3: number | null;
  /** From `;TIME:` (precise), else the end-of-file text estimate. */
  estimatedSeconds: number | null;
  nozzleTempC: number | null;
  bedTempC: number | null;
  bedType: string | null;
  infillPct: number | null;
  infillPattern: string | null;
  wallLoops: number | null;
  supportType: string | null;
  supportsEnabled: boolean | null;
  /** Read for reference only; never used in cost (D40.4). */
  slicerFilamentCost: number | null;
  objects: PlateObject[];
  /** Largest thumbnail first. */
  thumbnails: Thumbnail[];
  /** Every `key = value` / `key: value` comment from the header and config blocks (D14). */
  rawHeader: Record<string, string>;
};

/** The three parts of a file a parser reads. Moves are never parsed. */
export type GcodeChunks = { head: string; tail: string; objectLines: string[] };

export interface GcodeParser {
  readonly id: string;
  readonly version: string;
  /** Quick check on the head: is this file in my format? */
  detect(head: string, tail: string): boolean;
  parse(chunks: GcodeChunks): ParsedGcode;
}

export class GcodeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GcodeFormatError";
  }
}
