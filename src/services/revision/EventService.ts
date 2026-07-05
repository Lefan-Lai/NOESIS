import type {
  EventLogRecord,
  FlexiblePayload,
  MemoryEffect,
  MemoryScope,
  ObjectStatus,
  RevisionEventType,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TimelineEdgeType
} from "@/types/revision";
import { TimelineService } from "./TimelineService";

type EventInput = {
  id?: string;
  projectId: string;
  eventType: RevisionEventType;
  objectType: RevisionObjectType;
  objectId: string;
  actor: EventLogRecord["actor"];
  timestamp?: string;
  payload?: FlexiblePayload;
};

type TimelineInput = {
  id?: string;
  conversationId?: string;
  parentNodeId?: string | null;
  label: string;
  model?: string;
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  status?: ObjectStatus;
  activePathId?: string;
  createdContentRef?: string;
  affectedContextRefs?: string[];
  payload?: FlexiblePayload;
};

type TimelineEdgeInput = {
  id?: string;
  sourceNodeId: string;
  edgeType?: TimelineEdgeType;
  label?: string;
  status?: ObjectStatus;
  payload?: FlexiblePayload;
};

function eventId(input: EventInput) {
  return (
    input.id ??
    `event-${input.eventType}-${input.objectId}-${Date.now().toString(36)}`
  );
}

export class EventService {
  static createEvent(
    state: Pick<RevisionRepositoryState, "eventLogs">,
    input: EventInput
  ): {
    event: EventLogRecord;
    eventLogs: RevisionRepositoryState["eventLogs"];
  } {
    const id = eventId(input);
    const existing = state.eventLogs[id];

    if (existing) {
      return {
        event: existing,
        eventLogs: state.eventLogs
      };
    }

    const event: EventLogRecord = {
      id,
      projectId: input.projectId,
      eventType: input.eventType,
      objectType: input.objectType,
      objectId: input.objectId,
      actor: input.actor,
      timestamp: input.timestamp ?? new Date().toISOString(),
      immutable: true,
      payload: input.payload ?? {}
    };

    return {
      event,
      eventLogs: {
        ...state.eventLogs,
        [event.id]: event
      }
    };
  }

  static createEventWithTimelineNode(
    state: Pick<
      RevisionRepositoryState,
      "eventLogs" | "timelineNodes" | "timelineEdges"
    >,
    eventInput: EventInput,
    timelineInput: TimelineInput,
    edgeInput?: TimelineEdgeInput
  ): {
    event: EventLogRecord;
    timelineNode: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
    eventLogs: RevisionRepositoryState["eventLogs"];
    timelineNodes: RevisionRepositoryState["timelineNodes"];
    timelineEdges: RevisionRepositoryState["timelineEdges"];
  } {
    const eventResult = EventService.createEvent(state, eventInput);
    const nodeResult = TimelineService.createTimelineNode(
      {
        timelineNodes: state.timelineNodes
      },
      {
        id:
          timelineInput.id ??
          `timeline-${eventInput.eventType}-${eventInput.objectId}`,
        projectId: eventInput.projectId,
        conversationId: timelineInput.conversationId,
        parentNodeId: timelineInput.parentNodeId,
        eventId: eventResult.event.id,
        eventType: eventInput.eventType,
        targetObjectType: eventInput.objectType,
        targetObjectId: eventInput.objectId,
        label: timelineInput.label,
        actor: eventInput.actor,
        model: timelineInput.model,
        memoryScope: timelineInput.memoryScope,
        memoryEffect: timelineInput.memoryEffect,
        status: timelineInput.status ?? "active",
        activePathId: timelineInput.activePathId,
        createdContentRef: timelineInput.createdContentRef,
        affectedContextRefs: timelineInput.affectedContextRefs,
        timestamp: eventResult.event.timestamp,
        payload: timelineInput.payload
      }
    );
    const edgeResult =
      edgeInput && edgeInput.sourceNodeId
        ? TimelineService.createTimelineEdge(
            {
              timelineEdges: state.timelineEdges
            },
            {
              id:
                edgeInput.id ??
                `timeline-edge-${edgeInput.sourceNodeId}-${nodeResult.timelineNode.id}`,
              projectId: eventInput.projectId,
              sourceNodeId: edgeInput.sourceNodeId,
              targetNodeId: nodeResult.timelineNode.id,
              edgeType: edgeInput.edgeType ?? "sequence",
              label: edgeInput.label,
              status: edgeInput.status ?? "active",
              timestamp: eventResult.event.timestamp,
              payload: edgeInput.payload
            }
          )
        : null;

    return {
      event: eventResult.event,
      timelineNode: nodeResult.timelineNode,
      timelineEdge: edgeResult?.timelineEdge,
      eventLogs: eventResult.eventLogs,
      timelineNodes: nodeResult.timelineNodes,
      timelineEdges: edgeResult?.timelineEdges ?? state.timelineEdges
    };
  }

  static getEventsForObject(
    state: Pick<RevisionRepositoryState, "eventLogs">,
    objectType: RevisionObjectType,
    objectId: string
  ) {
    return Object.values(state.eventLogs)
      .filter(
        (event) => event.objectType === objectType && event.objectId === objectId
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }

  static getEventsForProject(
    state: Pick<RevisionRepositoryState, "eventLogs">,
    projectId: string
  ) {
    return Object.values(state.eventLogs)
      .filter((event) => event.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }
}
