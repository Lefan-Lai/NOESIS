"use client";

import {
  CheckCircle2,
  Merge,
  MessageSquarePlus,
  Trash2,
  XCircle
} from "lucide-react";

type ThreadActionBarProps = {
  onKeep: () => void;
  onAddContextNote: () => void;
  onMerge: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  disabled?: boolean;
  noteActionsEnabled?: boolean;
};

export function ThreadActionBar({
  onKeep,
  onAddContextNote,
  onMerge,
  onDiscard,
  onDelete,
  disabled,
  noteActionsEnabled
}: ThreadActionBarProps) {
  const noteDisabled = disabled && !noteActionsEnabled;

  return (
    <div className="flex flex-wrap gap-2 border-t border-line p-3">
      {disabled && (
        <div className="basis-full text-xs font-semibold text-muted">
          Phase 4: note actions are active; merge, discard, and delete remain guarded.
        </div>
      )}
      <button
        onClick={onKeep}
        disabled={noteDisabled}
        className="flex h-9 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 text-xs font-semibold text-atlasGreen disabled:opacity-50"
      >
        <CheckCircle2 size={16} />
        Keep as Note
      </button>
      <button
        onClick={onAddContextNote}
        disabled={noteDisabled}
        className="flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 disabled:opacity-50"
        title="Write a context note that will be considered by future LLM calls."
      >
        <MessageSquarePlus size={16} />
        Add Context Note
      </button>
      <button
        onClick={onMerge}
        disabled={disabled}
        className="flex h-9 items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 text-xs font-semibold text-atlasPurple disabled:opacity-50"
      >
        <Merge size={16} />
        Merge into Document
      </button>
      <button
        onClick={onDiscard}
        disabled={disabled}
        className="flex h-9 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-atlasOrange disabled:opacity-50"
        title="Hide this local answer, but keep it available for future context."
      >
        <XCircle size={16} />
        Discard
      </button>
      <button
        onClick={onDelete}
        disabled={disabled}
        className="flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-atlasRed disabled:opacity-50"
      >
        <Trash2 size={16} />
        Delete
      </button>
    </div>
  );
}
