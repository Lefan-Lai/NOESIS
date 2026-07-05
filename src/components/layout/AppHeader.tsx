"use client";

import {
  BookOpen,
  CircleHelp,
  FolderPlus,
  GitBranchPlus,
  MessagesSquare,
  PlusCircle,
  Search,
  Settings2,
  Share2
} from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

export function AppHeader() {
  const projects = useAnswerAtlasStore((state) => state.projects);
  const currentProjectId = useAnswerAtlasStore((state) => state.currentProjectId);
  const switchProject = useAnswerAtlasStore((state) => state.switchProject);
  const createProject = useAnswerAtlasStore((state) => state.createProject);
  const resetWorkspace = useAnswerAtlasStore((state) => state.resetWorkspace);
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const createBranch = useAnswerAtlasStore((state) => state.createBranch);
  const setActiveUtilityPanel = useAnswerAtlasStore(
    (state) => state.setActiveUtilityPanel
  );
  const toggleContextDebugPanel = useAnswerAtlasStore(
    (state) => state.toggleContextDebugPanel
  );
  const projectList = Object.values(projects);

  return (
    <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-line px-4 max-[900px]:px-3">
      <div className="flex min-w-[430px] items-baseline gap-5 max-[1280px]:min-w-[220px] max-[900px]:min-w-0">
        <h1 className="whitespace-nowrap text-2xl font-bold tracking-normal text-ink">
          NOESIS
        </h1>
        <p className="text-sm font-medium text-slate-600 max-[1280px]:hidden">
          Document Answer + Side Threads + Structure Map
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex h-10 w-[330px] items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-muted shadow-sm max-[1280px]:w-[300px] max-[900px]:hidden">
          <Search size={17} />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search documents, questions, or..."
          />
          <kbd className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
            ⌘K
          </kbd>
        </label>
        <select
          value={currentProjectId}
          onChange={(event) => switchProject(event.target.value)}
          className="h-10 max-w-[190px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm max-[900px]:max-w-[120px]"
          title="Project"
          aria-label="Project"
        >
          {projectList.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button
          onClick={createProject}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
          title="New Project"
          aria-label="New Project"
        >
          <FolderPlus size={20} />
        </button>
        <button
          onClick={() => setActiveUtilityPanel("help")}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 max-[900px]:hidden"
          title="Help"
          aria-label="Help"
        >
          <CircleHelp size={21} />
        </button>
        <button
          onClick={() => setActiveUtilityPanel("workspace")}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 max-[900px]:hidden"
          title="Thread Navigator"
          aria-label="Thread Navigator"
        >
          <MessagesSquare size={21} />
        </button>
        <button
          onClick={() => setActiveUtilityPanel("documents")}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 max-[900px]:hidden"
          title="Library"
          aria-label="Library"
        >
          <BookOpen size={21} />
        </button>
        <button
          onClick={() => {
            if (selectedThreadId) {
              createBranch(selectedThreadId);
            } else {
              setActiveUtilityPanel("branches");
            }
          }}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 max-[900px]:hidden"
          title="Branches"
          aria-label="Branches"
        >
          <GitBranchPlus size={21} />
        </button>
        <button
          onClick={() => setActiveUtilityPanel("share")}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 max-[900px]:hidden"
          title="Share"
          aria-label="Share"
        >
          <Share2 size={21} />
        </button>
        <button
          onClick={toggleContextDebugPanel}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
          title="Context Preview"
          aria-label="Context Preview"
        >
          <Settings2 size={21} />
        </button>
        <button
          onClick={resetWorkspace}
          className="ml-1 flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-atlasBlue px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 max-[900px]:px-3"
        >
          <span className="max-[900px]:hidden">New Thread</span>
          <PlusCircle size={18} />
        </button>
      </div>
    </header>
  );
}
