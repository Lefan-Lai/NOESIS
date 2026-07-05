import { revisionRepository } from "@/services/revision/revisionRepository";
import { WorkspaceRepairService } from "@/services/revision/WorkspaceRepairService";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const result = WorkspaceRepairService.repairWorkspaceIntegrity(
  revisionRepository.getState(),
  {
    dryRun: !apply,
    apply,
    projectId: argValue("--project-id"),
    conversationId: argValue("--conversation-id")
  }
);

if (apply) {
  revisionRepository.replaceState(result.state);
}

console.log(
  JSON.stringify(
    {
      dryRun: result.dryRun,
      repaired: result.repaired,
      skipped: result.skipped
    },
    null,
    2
  )
);
