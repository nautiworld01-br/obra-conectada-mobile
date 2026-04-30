export type PendingCollectionKey = "fronts" | "stages";

export type PendingScreenUiState = {
  expandedCollections: Record<PendingCollectionKey, boolean>;
  visibleCountByCollection: Record<PendingCollectionKey, number>;
};

export const defaultPendingScreenUiState: PendingScreenUiState = {
  expandedCollections: {
    fronts: false,
    stages: false,
  },
  visibleCountByCollection: {
    fronts: 5,
    stages: 5,
  },
};

export type PendingOpenRequest =
  | {
      kind: "front";
      requestId: number;
      logDate: string;
      logId: string;
      serviceItemId: string;
    }
  | {
      kind: "stage";
      requestId: number;
      stageId: string;
    };

export type DailyScreenProps = {
  pendingOpenRequest?: PendingOpenRequest | null;
  onPendingFlowComplete?: () => void;
};

export type ScheduleScreenProps = {
  pendingOpenRequest?: PendingOpenRequest | null;
  onPendingFlowComplete?: () => void;
};

export type PendingItemsScreenProps = {
  onOpenPendingItem: (request: PendingOpenRequest) => void;
  uiState: PendingScreenUiState;
  onUiStateChange: (state: PendingScreenUiState) => void;
};
