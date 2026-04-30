import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { AppLoadingState } from "../components/AppState";
import { AppIcon } from "../components/AppIcon";
import { colors } from "../config/theme";
import { usePendingItems } from "../hooks/usePendingItems";
import { PendingCollectionKey, PendingItemsScreenProps, PendingScreenUiState } from "../navigation/AppShellNavigation";

function getPendingCountLabel(total: number) {
  return total === 1 ? "1 pendência" : `${total} pendências`;
}

function updateExpandedState(
  current: PendingScreenUiState,
  collectionKey: PendingCollectionKey,
  value: boolean,
) {
  return {
    ...current,
    expandedCollections: {
      ...current.expandedCollections,
      [collectionKey]: value,
    },
  };
}

function updateVisibleCountState(
  current: PendingScreenUiState,
  collectionKey: PendingCollectionKey,
  value: number,
) {
  return {
    ...current,
    visibleCountByCollection: {
      ...current.visibleCountByCollection,
      [collectionKey]: value,
    },
  };
}

export function PendingItemsScreen({ onOpenPendingItem, uiState, onUiStateChange }: PendingItemsScreenProps) {
  const { collections, total, isLoading } = usePendingItems();

  if (isLoading) {
    return (
      <AppScreen title="Pendências" disableLayoutAnimation>
        <AppLoadingState label="Carregando pendências..." />
      </AppScreen>
    );
  }

  if (total === 0) {
    return (
      <AppScreen title="Pendências" disableLayoutAnimation>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Tudo em dia</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Pendências" disableLayoutAnimation>
      <Text style={styles.summaryText}>{getPendingCountLabel(total)}</Text>

      {collections.map((collection) => {
        const expanded = uiState.expandedCollections[collection.key];
        const visibleCount = uiState.visibleCountByCollection[collection.key];
        const visibleItems = collection.items.slice(0, visibleCount);
        const hasMore = collection.items.length > visibleItems.length;

        return (
          <View key={collection.key} style={styles.collectionCard}>
            <View style={styles.collectionCardHeader}>
              <Text style={styles.collectionTitle}>{collection.title}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.collectionHeader, pressed && styles.buttonPressed]}
              onPress={() =>
                onUiStateChange(
                  updateExpandedState(
                    uiState,
                    collection.key,
                    !expanded,
                  ),
                )
              }
            >
              <Text style={styles.collectionCount}>{getPendingCountLabel(collection.total)}</Text>
              <AppIcon name={expanded ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
            </Pressable>

            {expanded ? (
              collection.items.length > 0 ? (
                <View style={styles.itemsList}>
                  {visibleItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.itemRow, pressed && styles.buttonPressed]}
                      onPress={() => {
                        if (item.navigationTarget.kind === "front") {
                          onOpenPendingItem({
                            kind: "front",
                            requestId: Date.now(),
                            logDate: item.navigationTarget.logDate,
                            logId: item.navigationTarget.logId,
                            serviceItemId: item.navigationTarget.serviceItemId,
                          });
                          return;
                        }

                        onOpenPendingItem({
                          kind: "stage",
                          requestId: Date.now(),
                          stageId: item.navigationTarget.stageId,
                        });
                      }}
                    >
                      <View style={styles.itemCopy}>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                        <Text style={styles.itemSource}>{item.sourceLabel}</Text>
                      </View>
                      <Text style={styles.itemAction}>Atualizar</Text>
                    </Pressable>
                  ))}

                  {hasMore ? (
                    <Pressable
                      style={({ pressed }) => [styles.showMoreButton, pressed && styles.buttonPressed]}
                      onPress={() =>
                        onUiStateChange(
                          updateVisibleCountState(
                            uiState,
                            collection.key,
                            visibleCount + 5,
                          ),
                        )
                      }
                    >
                      <Text style={styles.showMoreText}>Mostrar mais 5</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.collectionEmpty}>
                  <Text style={styles.collectionEmptyText}>Nenhuma pendência para analisar</Text>
                </View>
              )
              ) : null}
          </View>
        );
      })}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textAlign: "right",
  },
  collectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  collectionCardHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  collectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  collectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collectionCount: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  itemsList: {
    gap: 10,
    marginTop: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  itemSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  itemSource: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
  },
  itemAction: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  showMoreButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  collectionEmpty: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  collectionEmptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
