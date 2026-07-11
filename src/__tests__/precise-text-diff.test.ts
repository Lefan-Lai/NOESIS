import { describe, expect, it } from "vitest";
import { computePreciseTextDiff } from "@/lib/comparison/preciseTextDiff";

describe("computePreciseTextDiff", () => {
  it("returns the exact Chinese replacement without adjacent characters", () => {
    const original = "决赛中，法国队对阵克罗地亚队";
    const revised = "决赛中，法国队对阵美国队";
    const result = computePreciseTextDiff(original, revised);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      type: "replaced",
      originalText: "克罗地亚",
      revisedText: "美国"
    });
    expect(
      original.slice(
        result.changes[0].originalRange?.start,
        result.changes[0].originalRange?.end
      )
    ).toBe("克罗地亚");
    expect(
      revised.slice(
        result.changes[0].revisedRange?.start,
        result.changes[0].revisedRange?.end
      )
    ).toBe("美国");
  });

  it("keeps insertion and removal ranges separate", () => {
    const added = computePreciseTextDiff("AI helps.", "AI clearly helps.");
    const removed = computePreciseTextDiff("AI clearly helps.", "AI helps.");

    expect(added.changes).toEqual([
      expect.objectContaining({
        type: "added",
        originalText: "",
        revisedText: "clearly "
      })
    ]);
    expect(removed.changes).toEqual([
      expect.objectContaining({
        type: "removed",
        originalText: "clearly ",
        revisedText: ""
      })
    ]);
  });

  it("reports UTF-16 offsets that can be used directly by DOM ranges", () => {
    const original = "A😀旧B";
    const revised = "A😀新B";
    const change = computePreciseTextDiff(original, revised).changes[0];

    expect(change.originalRange).toEqual({ start: 3, end: 4 });
    expect(change.revisedRange).toEqual({ start: 3, end: 4 });
    expect(original.slice(change.originalRange?.start, change.originalRange?.end)).toBe("旧");
    expect(revised.slice(change.revisedRange?.start, change.revisedRange?.end)).toBe("新");
  });

  it("returns no change for identical text", () => {
    expect(computePreciseTextDiff("same", "same").changes).toEqual([]);
  });
});
