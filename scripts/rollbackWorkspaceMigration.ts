import { revisionRepository } from "@/services/revision/revisionRepository";
import { WorkspaceRollbackService } from "@/services/revision/WorkspaceRollbackService";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const deleteBackfilledRecords = process.argv.includes("--delete-backfilled-records");
const result = WorkspaceRollbackService.rollbackWorkspaceMigration(
  revisionRepository.getState(),
  {
    dryRun: !apply,
    apply,
    migrationJobId: argValue("--migration-job-id"),
    projectId: argValue("--project-id"),
    deleteBackfilledRecords
  }
);

if (apply) {
  revisionRepository.replaceState(result.state);
}

console.log(
  JSON.stringify(
    {
      dryRun: result.dryRun,
      disabledRevisionWorkspace: result.disabledRevisionWorkspace,
      enabledLegacyCompatibility: result.enabledLegacyCompatibility,
      removableBackfilledRecords: result.removableBackfilledRecords.length,
      removedTargetIds: result.removedTargetIds
    },
    null,
    2
  )
);
