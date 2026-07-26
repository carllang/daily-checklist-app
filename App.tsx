import { File, Paths } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// ─── Theme ──────────────────────────────────────────────────────────────────

type ThemeMode = "light" | "dark";

type Colors = {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  accent: string;
  accentLight: string;
  danger: string;
  checkboxBorder: string;
  placeholder: string;
};

const LIGHT: Colors = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textDisabled: "#CBD5E1",
  accent: "#2563EB",
  accentLight: "#DBEAFE",
  danger: "#EF4444",
  checkboxBorder: "#CBD5E1",
  placeholder: "#94A3B8",
};

const DARK: Colors = {
  background: "#0F172A",
  surface: "#1E293B",
  border: "#334155",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textDisabled: "#475569",
  accent: "#3B82F6",
  accentLight: "#1E3A5F",
  danger: "#F87171",
  checkboxBorder: "#475569",
  placeholder: "#64748B",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

type StoragePayload = {
  version: 1;
  items: ChecklistItem[];
};

type ThemePayload = {
  version: 1;
  mode: ThemeMode;
};

// ─── Storage ──────────────────────────────────────────────────────────────────

function storageFile(): File {
  return new File(Paths.document, "checklist_v1.json");
}

async function loadItems(): Promise<ChecklistItem[]> {
  try {
    const file = storageFile();
    if (!file.exists) return [];
    const raw = await file.text();
    const parsed = JSON.parse(raw) as StoragePayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function saveItems(items: ChecklistItem[]): void {
  const payload: StoragePayload = { version: 1, items };
  storageFile().write(JSON.stringify(payload));
}

function themeFile(): File {
  return new File(Paths.document, "theme_v1.json");
}

async function loadTheme(): Promise<ThemeMode> {
  try {
    const file = themeFile();
    if (!file.exists) return "light";
    const raw = await file.text();
    const parsed = JSON.parse(raw) as ThemePayload;
    if (parsed.version !== 1) return "light";
    return parsed.mode === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function saveTheme(mode: ThemeMode): void {
  const payload: ThemePayload = { version: 1, mode };
  themeFile().write(JSON.stringify(payload));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = themeMode === "dark" ? DARK : LIGHT;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Load items and theme in parallel on mount
  useEffect(() => {
    Promise.all([loadItems(), loadTheme()]).then(([loaded, mode]) => {
      setItems(loaded);
      setThemeMode(mode);
      setReady(true);
    });
  }, []);

  // Persist theme whenever it changes
  useEffect(() => {
    if (!ready) return;
    saveTheme(themeMode);
  }, [themeMode, ready]);

  // Debounced save on every items change (skip before initial load)
  useEffect(() => {
    if (!ready) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveItems(items);
    }, 300);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [items, ready]);

  const addItem = useCallback(() => {
    const title = input.trim();
    if (!title) return;
    const newItem: ChecklistItem = {
      id: uid(),
      title,
      done: false,
      createdAt: Date.now(),
    };
    setItems((prev) => [newItem, ...prev]);
    setInput("");
  }, [input]);

  const toggleItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // ─── Drag-to-reorder (built-in responder system, no native library) ─────────
  const ITEM_HEIGHT = 62;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragCurrentIndexRef = useRef<number | null>(null);
  const dragOverCurrentIndexRef = useRef<number | null>(null);
  const itemsLengthRef = useRef(items.length);
  useEffect(() => {
    itemsLengthRef.current = items.length;
  }, [items.length]);

  const onDragGrant = useCallback((index: number, pageY: number) => {
    dragCurrentIndexRef.current = index;
    dragOverCurrentIndexRef.current = index;
    dragStartYRef.current = pageY;
    setDragIndex(index);
    setDragOverIndex(index);
  }, []);

  const onDragMove = useCallback((pageY: number) => {
    const from = dragCurrentIndexRef.current;
    if (from === null) return;
    const dy = pageY - dragStartYRef.current;
    const to = Math.max(
      0,
      Math.min(itemsLengthRef.current - 1, from + Math.round(dy / ITEM_HEIGHT)),
    );
    if (to !== dragOverCurrentIndexRef.current) {
      dragOverCurrentIndexRef.current = to;
      setDragOverIndex(to);
    }
  }, []);

  const onDragRelease = useCallback(() => {
    const from = dragCurrentIndexRef.current;
    const to = dragOverCurrentIndexRef.current;
    if (from !== null && to !== null && from !== to) {
      setItems((prev) => {
        const next = [...prev];
        const [removed] = next.splice(from, 1);
        next.splice(to, 0, removed);
        return next;
      });
    }
    dragCurrentIndexRef.current = null;
    dragOverCurrentIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const clearCompleted = useCallback(() => {
    const completedCount = items.filter((i) => i.done).length;
    if (completedCount === 0) return;
    Alert.alert(
      "Clear completed",
      `Remove ${completedCount} completed item${completedCount !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => setItems((prev) => prev.filter((i) => !i.done)),
        },
      ],
    );
  }, [items]);

  const completedCount = items.filter((i) => i.done).length;
  const remainingCount = items.length - completedCount;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.appTitle}>Daily Checklist</Text>
                <Text style={styles.dateText}>{formatDate()}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.settingsBtn,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setSettingsVisible(true)}
                accessibilityLabel="Open settings"
              >
                <Text style={styles.settingsBtnText}>Settings</Text>
              </Pressable>
            </View>
            {items.length > 0 && (
              <>
                <View style={styles.statsRow}>
                  <Text style={styles.statsText}>
                    {remainingCount} remaining · {completedCount} done
                  </Text>
                  <Text style={styles.percentageText}>
                    {Math.round((completedCount / items.length) * 100)}%
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(
                          (completedCount / items.length) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </>
            )}
          </View>

          {/* List */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            scrollEnabled={dragIndex === null}
            contentContainerStyle={
              items.length === 0 ? styles.emptyContainer : styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✓</Text>
                <Text style={styles.emptyTitle}>All clear</Text>
                <Text style={styles.emptySubtitle}>
                  Add a task below to get started.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                  dragIndex === index && styles.rowDragging,
                  dragOverIndex === index &&
                    dragIndex !== index &&
                    styles.rowDropTarget,
                ]}
                onPress={() => toggleItem(item.id)}
                onLongPress={() => deleteItem(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityHint="Long press to delete"
              >
                <View
                  style={[styles.checkbox, item.done && styles.checkboxDone]}
                >
                  {item.done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text
                  style={[styles.itemTitle, item.done && styles.itemTitleDone]}
                >
                  {item.title}
                </Text>
                <View
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) =>
                    onDragGrant(index!, e.nativeEvent.pageY)
                  }
                  onResponderMove={(e) => onDragMove(e.nativeEvent.pageY)}
                  onResponderRelease={() => onDragRelease()}
                  onResponderTerminate={() => onDragRelease()}
                  style={styles.dragHandle}
                >
                  <Text
                    style={[
                      styles.dragHandleText,
                      dragIndex === index && styles.dragHandleActive,
                    ]}
                  >
                    ≡
                  </Text>
                </View>
              </Pressable>
            )}
          />

          {/* Footer */}
          {completedCount > 0 && (
            <Pressable style={styles.clearBtn} onPress={clearCompleted}>
              <Text style={styles.clearBtnText}>
                Clear completed ({completedCount})
              </Text>
            </Pressable>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="New task…"
              placeholderTextColor={colors.placeholder}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={addItem}
              returnKeyType="done"
              blurOnSubmit={false}
              maxLength={200}
            />
            <Pressable
              style={[styles.addBtn, !input.trim() && styles.addBtnDisabled]}
              onPress={addItem}
              disabled={!input.trim()}
              accessibilityLabel="Add task"
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        {/* Settings Modal */}
        <Modal
          visible={settingsVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSettingsVisible(false)}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settings</Text>
              <Pressable onPress={() => setSettingsVisible(false)} hitSlop={12}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Appearance</Text>
              <View style={styles.segmented}>
                <Pressable
                  style={[
                    styles.segment,
                    themeMode === "light" && styles.segmentActive,
                  ]}
                  onPress={() => setThemeMode("light")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      themeMode === "light" && styles.segmentTextActive,
                    ]}
                  >
                    ☀ Light
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segment,
                    themeMode === "dark" && styles.segmentActive,
                  ]}
                  onPress={() => setThemeMode("dark")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      themeMode === "dark" && styles.segmentTextActive,
                    ]}
                  >
                    ☾ Dark
                  </Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    flex: {
      flex: 1,
    },

    // Header
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.background,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerText: {
      flex: 1,
    },
    appTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: c.textPrimary,
      letterSpacing: -0.5,
    },
    dateText: {
      fontSize: 14,
      color: c.textSecondary,
      marginTop: 2,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 6,
    },
    statsText: {
      fontSize: 13,
      color: c.textMuted,
    },
    percentageText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.textMuted,
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginTop: 8,
      overflow: "hidden",
    },
    progressFill: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.accent,
    },
    settingsBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    settingsBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
    },

    // List
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    emptyContainer: {
      flex: 1,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 80,
    },
    emptyIcon: {
      fontSize: 48,
      color: c.textDisabled,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "600",
      color: c.textMuted,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: c.textDisabled,
    },

    // Row
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginVertical: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    rowPressed: {
      opacity: 0.75,
    },
    rowDragging: {
      borderWidth: 1.5,
      borderColor: c.accent,
      opacity: 0.7,
    },
    rowDropTarget: {
      borderLeftWidth: 3,
      borderLeftColor: c.accent,
    },
    dragHandle: {
      paddingHorizontal: 10,
      paddingVertical: 10,
      marginLeft: 4,
      justifyContent: "center",
      alignItems: "center",
    },
    dragHandleText: {
      fontSize: 20,
      color: c.textDisabled,
      letterSpacing: 1,
    },
    dragHandleActive: {
      color: c.accent,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.checkboxBorder,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      flexShrink: 0,
    },
    checkboxDone: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    checkmark: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 16,
    },
    itemTitle: {
      flex: 1,
      fontSize: 16,
      color: c.textPrimary,
    },
    itemTitleDone: {
      color: c.textMuted,
      textDecorationLine: "line-through",
    },

    // Clear
    clearBtn: {
      alignSelf: "center",
      paddingVertical: 6,
      paddingHorizontal: 14,
      marginBottom: 4,
    },
    clearBtnText: {
      fontSize: 13,
      color: c.danger,
      fontWeight: "500",
    },

    // Input
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
      gap: 10,
    },
    textInput: {
      flex: 1,
      height: 46,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingHorizontal: 14,
      fontSize: 16,
      color: c.textPrimary,
      backgroundColor: c.background,
    },
    addBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingHorizontal: 20,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtnDisabled: {
      backgroundColor: c.accentLight,
    },
    addBtnText: {
      color: "#fff",
      fontWeight: "600",
      fontSize: 15,
    },

    // Modal
    modalSafe: {
      flex: 1,
      backgroundColor: c.background,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.textPrimary,
    },
    modalDone: {
      fontSize: 16,
      fontWeight: "600",
      color: c.accent,
    },

    // Settings content
    settingSection: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    settingLabel: {
      fontSize: 16,
      color: c.textPrimary,
      fontWeight: "500",
    },
    segmented: {
      flexDirection: "row",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    segment: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.surface,
    },
    segmentActive: {
      backgroundColor: c.accent,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: "500",
      color: c.textSecondary,
    },
    segmentTextActive: {
      color: "#fff",
    },
  });
}
