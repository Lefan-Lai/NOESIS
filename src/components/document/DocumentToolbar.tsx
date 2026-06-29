"use client";

import {
  AlignLeft,
  Bold,
  ChevronDown,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  Undo2
} from "lucide-react";

const toolbarButtons = [
  { icon: Undo2, label: "Undo" },
  { icon: Redo2, label: "Redo" },
  { icon: AlignLeft, label: "Style" },
  { icon: List, label: "Bullets" },
  { icon: ListOrdered, label: "Numbered list" },
  { icon: Bold, label: "Bold" },
  { icon: Italic, label: "Italic" },
  { icon: Link, label: "Link" }
];

export function DocumentToolbar() {
  return (
    <div className="flex h-10 items-center gap-1 border-b border-line px-3 text-slate-600">
      {toolbarButtons.map((button, index) => {
        const Icon = button.icon;
        const isStyle = button.label === "Style";

        return (
          <button
            key={button.label}
            className={`grid h-8 place-items-center rounded-md hover:bg-slate-100 ${
              isStyle ? "w-28 grid-cols-[1fr_16px] px-2" : "w-8"
            } ${index === 2 ? "ml-3 border-l border-line pl-3" : ""}`}
            title={button.label}
            aria-label={button.label}
          >
            {isStyle ? (
              <>
                <span className="text-xs">Normal</span>
                <ChevronDown size={14} />
              </>
            ) : (
              <Icon size={17} />
            )}
          </button>
        );
      })}
    </div>
  );
}
