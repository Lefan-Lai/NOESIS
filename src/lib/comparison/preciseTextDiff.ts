export type PreciseTextRange = {
  start: number;
  end: number;
};

export type PreciseTextChange = {
  id: string;
  type: "added" | "removed" | "replaced";
  originalRange?: PreciseTextRange;
  revisedRange?: PreciseTextRange;
  originalText: string;
  revisedText: string;
};

type CharacterToken = {
  value: string;
  start: number;
  end: number;
};

type DiffOperation = {
  type: "equal" | "delete" | "insert";
  original?: CharacterToken;
  revised?: CharacterToken;
};

const MAX_LCS_CELLS = 1_600_000;

function tokenize(text: string) {
  const tokens: CharacterToken[] = [];
  let offset = 0;

  for (const value of Array.from(text)) {
    const start = offset;
    offset += value.length;
    tokens.push({ value, start, end: offset });
  }

  return tokens;
}

function commonAffixDiff(original: string, revised: string): DiffOperation[] {
  const originalTokens = tokenize(original);
  const revisedTokens = tokenize(revised);
  let prefix = 0;

  while (
    prefix < originalTokens.length &&
    prefix < revisedTokens.length &&
    originalTokens[prefix].value === revisedTokens[prefix].value
  ) {
    prefix += 1;
  }

  let originalSuffix = originalTokens.length;
  let revisedSuffix = revisedTokens.length;

  while (
    originalSuffix > prefix &&
    revisedSuffix > prefix &&
    originalTokens[originalSuffix - 1].value === revisedTokens[revisedSuffix - 1].value
  ) {
    originalSuffix -= 1;
    revisedSuffix -= 1;
  }

  return [
    ...originalTokens.slice(0, prefix).map((token, index) => ({
      type: "equal" as const,
      original: token,
      revised: revisedTokens[index]
    })),
    ...originalTokens.slice(prefix, originalSuffix).map((token) => ({
      type: "delete" as const,
      original: token
    })),
    ...revisedTokens.slice(prefix, revisedSuffix).map((token) => ({
      type: "insert" as const,
      revised: token
    })),
    ...originalTokens.slice(originalSuffix).map((token, index) => ({
      type: "equal" as const,
      original: token,
      revised: revisedTokens[revisedSuffix + index]
    }))
  ];
}

function lcsOperations(original: string, revised: string): DiffOperation[] {
  const originalTokens = tokenize(original);
  const revisedTokens = tokenize(revised);
  const rows = originalTokens.length + 1;
  const columns = revisedTokens.length + 1;

  if (rows * columns > MAX_LCS_CELLS) {
    return commonAffixDiff(original, revised);
  }

  const table = new Uint16Array(rows * columns);

  for (let i = originalTokens.length - 1; i >= 0; i -= 1) {
    for (let j = revisedTokens.length - 1; j >= 0; j -= 1) {
      const index = i * columns + j;

      table[index] = originalTokens[i].value === revisedTokens[j].value
        ? table[(i + 1) * columns + j + 1] + 1
        : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let i = 0;
  let j = 0;

  while (i < originalTokens.length || j < revisedTokens.length) {
    if (
      i < originalTokens.length &&
      j < revisedTokens.length &&
      originalTokens[i].value === revisedTokens[j].value
    ) {
      operations.push({
        type: "equal",
        original: originalTokens[i],
        revised: revisedTokens[j]
      });
      i += 1;
      j += 1;
      continue;
    }

    const deleteScore = i < originalTokens.length
      ? table[(i + 1) * columns + j]
      : -1;
    const insertScore = j < revisedTokens.length
      ? table[i * columns + j + 1]
      : -1;

    if (i < originalTokens.length && deleteScore >= insertScore) {
      operations.push({ type: "delete", original: originalTokens[i] });
      i += 1;
    } else if (j < revisedTokens.length) {
      operations.push({ type: "insert", revised: revisedTokens[j] });
      j += 1;
    }
  }

  return operations;
}

function operationsToChanges(
  operations: DiffOperation[],
  original: string,
  revised: string
) {
  const changes: PreciseTextChange[] = [];
  let pending: DiffOperation[] = [];

  const flush = () => {
    if (pending.length === 0) {
      return;
    }

    const deleted = pending.flatMap((operation) =>
      operation.original ? [operation.original] : []
    );
    const inserted = pending.flatMap((operation) =>
      operation.revised ? [operation.revised] : []
    );
    const originalRange = deleted.length > 0
      ? { start: deleted[0].start, end: deleted[deleted.length - 1].end }
      : undefined;
    const revisedRange = inserted.length > 0
      ? { start: inserted[0].start, end: inserted[inserted.length - 1].end }
      : undefined;
    const type = originalRange && revisedRange
      ? "replaced"
      : originalRange
        ? "removed"
        : "added";

    changes.push({
      id: `change-${changes.length + 1}`,
      type,
      originalRange,
      revisedRange,
      originalText: originalRange
        ? original.slice(originalRange.start, originalRange.end)
        : "",
      revisedText: revisedRange
        ? revised.slice(revisedRange.start, revisedRange.end)
        : ""
    });
    pending = [];
  };

  operations.forEach((operation) => {
    if (operation.type === "equal") {
      flush();
    } else {
      pending.push(operation);
    }
  });
  flush();

  return changes;
}

export function computePreciseTextDiff(original: string, revised: string) {
  if (original === revised) {
    return { changes: [] as PreciseTextChange[] };
  }

  return {
    changes: operationsToChanges(lcsOperations(original, revised), original, revised)
  };
}

export function contextForRange(
  text: string,
  range: PreciseTextRange | undefined,
  radius = 38
) {
  if (!range) {
    return { before: "", changed: "", after: "" };
  }

  return {
    before: text.slice(Math.max(0, range.start - radius), range.start),
    changed: text.slice(range.start, range.end),
    after: text.slice(range.end, Math.min(text.length, range.end + radius))
  };
}
