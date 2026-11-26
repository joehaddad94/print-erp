import { describe, expect, it } from "vitest";
import { hiddenColumnsCss, parseHidden, toggleColumn } from "@/lib/ui/columns";
import { editReducer, initialEdit, shouldSave, type EditEvent, type EditState } from "@/lib/ui/inline-edit";
import { groupItems, matches, moveActive, type PickerItem } from "@/lib/ui/picker";
import { initialRail } from "@/lib/ui/sidebar";

describe("DataTable columns", () => {
  const known = ["order", "customer", "items", "notes"];
  it("reads stored hidden columns, dropping unknown, pinned and duplicate keys", () => {
    expect(parseHidden('["notes","nope","order","notes"]', known, ["order"])).toEqual(["notes"]);
  });
  it("treats missing or broken storage as nothing hidden", () => {
    expect(parseHidden(null, known)).toEqual([]);
    expect(parseHidden("{bad", known)).toEqual([]);
    expect(parseHidden('{"a":1}', known)).toEqual([]);
  });
  it("toggles a column but never hides a pinned one", () => {
    expect(toggleColumn([], "notes")).toEqual(["notes"]);
    expect(toggleColumn(["notes"], "notes")).toEqual([]);
    expect(toggleColumn([], "order", ["order"])).toEqual([]);
  });
  it("builds CSS scoped to one table and strips unsafe characters", () => {
    expect(hiddenColumnsCss("orders", ["notes"])).toBe('#orders [data-col="notes"]{display:none}');
    expect(hiddenColumnsCss("t", ['x"]{}body{'])).toBe('#t [data-col="xbody"]{display:none}');
  });
});

describe("SearchPicker", () => {
  const items: PickerItem[] = [
    { id: "1", label: "Padel racket holder", sub: "v3 · 46 g", keywords: "PLA Black" },
    { id: "2", label: "Betta floater", sub: "v1 · 12 g", keywords: "PETG Clear" },
    { id: "3", label: "Clip", sub: "v2", keywords: "PLA White", disabled: true },
    { id: "4", label: "Crème box", sub: "v1" },
  ];
  it("matches every word in any order across name, sub line and keywords, ignoring accents and case", () => {
    expect(matches(items[0]!, "black padel")).toBe(true);
    expect(matches(items[0]!, "petg")).toBe(false);
    expect(matches(items[3]!, "creme")).toBe(true);
  });
  it("puts recently used first in recent order, then the rest A to Z", () => {
    const g = groupItems(items, "", ["2"]);
    expect(g.map((x) => x.label)).toEqual(["Recently used", "All"]);
    expect(g[0]!.items.map((i) => i.id)).toEqual(["2"]);
    expect(g[1]!.items.map((i) => i.label)).toEqual(["Clip", "Crème box", "Padel racket holder"]);
  });
  it("drops empty groups and the 'All' title when nothing is recent", () => {
    const g = groupItems(items, "pla", []);
    expect(g).toHaveLength(1);
    expect(g[0]!.label).toBe("");
    expect(groupItems(items, "zzz")).toEqual([]);
  });
  it("arrow keys skip rows that can't be picked and wrap around", () => {
    const flat = [items[0]!, items[2]!, items[1]!]; // middle one disabled
    expect(moveActive(flat, -1, 1)).toBe(0);
    expect(moveActive(flat, 0, 1)).toBe(2);
    expect(moveActive(flat, 2, 1)).toBe(0);
    expect(moveActive(flat, -1, -1)).toBe(2);
    expect(moveActive([items[2]!], -1, 1)).toBe(-1);
    expect(moveActive([], -1, 1)).toBe(-1);
  });
});

describe("InlineEdit", () => {
  const run = (events: EditEvent[], s: EditState = initialEdit("22")) => events.reduce(editReducer, s);
  it("Enter with a changed value saves once; a blur right after does not save again", () => {
    const editing = run([{ type: "open" }, { type: "type", draft: " 23 " }]);
    const saving = editReducer(editing, { type: "commit" });
    expect(saving).toEqual({ mode: "saving", value: "22", draft: "23" });
    expect(shouldSave(editing, saving)).toBe(true);
    const blur = editReducer(saving, { type: "commit" });
    expect(shouldSave(saving, blur)).toBe(false);
  });
  it("no save when the value is unchanged", () => {
    expect(run([{ type: "open" }, { type: "type", draft: "22 " }, { type: "commit" }])).toEqual(initialEdit("22"));
  });
  it("Esc cancels and keeps the old value", () => {
    expect(run([{ type: "open" }, { type: "type", draft: "99" }, { type: "cancel" }])).toEqual(initialEdit("22"));
  });
  it("shows the new value after saving, and keeps the draft with the error when saving fails", () => {
    const saving = run([{ type: "open" }, { type: "type", draft: "23" }, { type: "commit" }]);
    expect(editReducer(saving, { type: "saved", value: "23" })).toEqual(initialEdit("23"));
    expect(editReducer(saving, { type: "failed", error: "Must be a number" })).toEqual({
      mode: "edit",
      value: "22",
      draft: "23",
      error: "Must be a number",
    });
  });
});

describe("Sidebar", () => {
  it("expands by default at 1280px and wider, collapses below", () => {
    expect(initialRail(null, 1366)).toBe("expanded");
    expect(initialRail(null, 1280)).toBe("expanded");
    expect(initialRail(null, 1100)).toBe("collapsed");
  });
  it("a remembered choice wins; junk is ignored", () => {
    expect(initialRail("collapsed", 1600)).toBe("collapsed");
    expect(initialRail("expanded", 1024)).toBe("expanded");
    expect(initialRail("huge", 1024)).toBe("collapsed");
  });
});
