export type TextDiffChunk = {
  type: "equal" | "removed" | "added";
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  text: string;
};

export type TextDiffChangedRange = {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
};

export type TextDiffSummary = {
  addedCharacters: number;
  removedCharacters: number;
  changedCharacters: number;
  chunkCount: number;
};

export type TextDiff = {
  oldContentHash: string;
  newContentHash: string;
  chunks: TextDiffChunk[];
  summary: TextDiffSummary;
  changedRanges: TextDiffChangedRange[];
};

export function hashContent(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  let hash = 2166136261;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `content-${(hash >>> 0).toString(36)}`;
}

function commonPrefixLength(oldContent: string, newContent: string) {
  const max = Math.min(oldContent.length, newContent.length);
  let index = 0;

  while (index < max && oldContent[index] === newContent[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  oldContent: string,
  newContent: string,
  prefixLength: number
) {
  const max = Math.min(
    oldContent.length - prefixLength,
    newContent.length - prefixLength
  );
  let index = 0;

  while (
    index < max &&
    oldContent[oldContent.length - 1 - index] ===
      newContent[newContent.length - 1 - index]
  ) {
    index += 1;
  }

  return index;
}

export class DiffService {
  static createTextDiff(oldContent: string, newContent: string): TextDiff {
    const oldContentHash = hashContent(oldContent);
    const newContentHash = hashContent(newContent);

    if (oldContent === newContent) {
      return {
        oldContentHash,
        newContentHash,
        chunks: [
          {
            type: "equal",
            oldStart: 0,
            oldEnd: oldContent.length,
            newStart: 0,
            newEnd: newContent.length,
            text: oldContent
          }
        ],
        summary: {
          addedCharacters: 0,
          removedCharacters: 0,
          changedCharacters: 0,
          chunkCount: 1
        },
        changedRanges: []
      };
    }

    const prefixLength = commonPrefixLength(oldContent, newContent);
    const suffixLength = commonSuffixLength(
      oldContent,
      newContent,
      prefixLength
    );
    const oldChangedEnd = oldContent.length - suffixLength;
    const newChangedEnd = newContent.length - suffixLength;
    const removedText = oldContent.slice(prefixLength, oldChangedEnd);
    const addedText = newContent.slice(prefixLength, newChangedEnd);
    const chunks: TextDiffChunk[] = [];

    if (prefixLength > 0) {
      chunks.push({
        type: "equal",
        oldStart: 0,
        oldEnd: prefixLength,
        newStart: 0,
        newEnd: prefixLength,
        text: oldContent.slice(0, prefixLength)
      });
    }

    if (removedText) {
      chunks.push({
        type: "removed",
        oldStart: prefixLength,
        oldEnd: oldChangedEnd,
        newStart: prefixLength,
        newEnd: prefixLength,
        text: removedText
      });
    }

    if (addedText) {
      chunks.push({
        type: "added",
        oldStart: oldChangedEnd,
        oldEnd: oldChangedEnd,
        newStart: prefixLength,
        newEnd: newChangedEnd,
        text: addedText
      });
    }

    if (suffixLength > 0) {
      chunks.push({
        type: "equal",
        oldStart: oldChangedEnd,
        oldEnd: oldContent.length,
        newStart: newChangedEnd,
        newEnd: newContent.length,
        text: oldContent.slice(oldChangedEnd)
      });
    }

    const diff: TextDiff = {
      oldContentHash,
      newContentHash,
      chunks,
      summary: {
        addedCharacters: addedText.length,
        removedCharacters: removedText.length,
        changedCharacters: Math.max(addedText.length, removedText.length),
        chunkCount: chunks.length
      },
      changedRanges: [
        {
          oldStart: prefixLength,
          oldEnd: oldChangedEnd,
          newStart: prefixLength,
          newEnd: newChangedEnd
        }
      ]
    };

    return {
      ...diff,
      summary: DiffService.summarizeDiff(diff)
    };
  }

  static summarizeDiff(diff: TextDiff): TextDiffSummary {
    const addedCharacters = diff.chunks
      .filter((chunk) => chunk.type === "added")
      .reduce((total, chunk) => total + chunk.text.length, 0);
    const removedCharacters = diff.chunks
      .filter((chunk) => chunk.type === "removed")
      .reduce((total, chunk) => total + chunk.text.length, 0);

    return {
      addedCharacters,
      removedCharacters,
      changedCharacters: Math.max(addedCharacters, removedCharacters),
      chunkCount: diff.chunks.length
    };
  }

  static getChangedRanges(diff: TextDiff) {
    return diff.changedRanges;
  }
}
