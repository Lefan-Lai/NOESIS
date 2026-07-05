import { NextResponse } from "next/server";
import { ContextSnapshotService } from "@/services/revision/ContextSnapshotService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params;
  const url = new URL(request.url);
  const group =
    (url.searchParams.get("group") as
      | "included"
      | "excluded"
      | "compressed"
      | "truncated"
      | null) ?? "included";
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const snapshot = revisionRepository.getState().contextSnapshots[snapshotId];

  if (!snapshot) {
    return NextResponse.json({ error: "Context snapshot not found" }, { status: 404 });
  }

  return NextResponse.json(
    ContextSnapshotService.getContextSnapshotItemsPage({
      snapshot,
      group,
      limit,
      cursor
    })
  );
}
