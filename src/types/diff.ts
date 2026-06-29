export type PatchOperation =
  | {
      op: "replace_block_text";
      blockId: string;
      oldText: string;
      newText: string;
    }
  | {
      op: "insert_block_after";
      afterBlockId: string;
      newBlockText: string;
    }
  | {
      op: "add_note_to_block";
      blockId: string;
      threadId: string;
    };
