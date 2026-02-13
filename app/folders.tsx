import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { supabase } from "@/lib/supabase";
import { ChatFolderWithCount } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// Доступные иконки для папок
const FOLDER_ICONS = [
  "folder",
  "people",
  "person",
  "heart",
  "star",
  "bookmark",
  "flag",
  "briefcase",
  "school",
  "home",
  "airplane",
  "car",
  "football",
  "game-controller",
  "musical-notes",
  "camera",
  "film",
  "book",
  "newspaper",
  "cart",
  "gift",
  "cafe",
  "restaurant",
  "fitness",
  "medkit",
  "paw",
  "leaf",
  "globe",
  "cloud",
  "sunny",
];

// Доступные цвета для папок
const FOLDER_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#5856D6",
  "#FF2D55",
  "#00C7BE",
  "#32ADE6",
  "#FFD60A",
];

export default function FoldersScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [folders, setFolders] = useState<ChatFolderWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFolder, setEditingFolder] =
    useState<ChatFolderWithCount | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("folder");
  const [selectedColor, setSelectedColor] = useState("#007AFF");

  useEffect(() => {
    fetchFolders();
  }, [user]);

  const fetchFolders = async () => {
    if (!user) return;

    try {
      // Получаем папки пользователя
      const { data: foldersData, error: foldersError } = await supabase
        .from("chat_folders")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true });

      if (foldersError) throw foldersError;

      // Получаем количество чатов в каждой папке
      const { data: itemsData, error: itemsError } = await supabase
        .from("chat_folder_items")
        .select("folder_id, chat_id")
        .eq("user_id", user.id);

      if (itemsError) throw itemsError;

      // Группируем чаты по папкам
      const folderItemsMap = new Map<string, string[]>();
      itemsData?.forEach((item) => {
        const existing = folderItemsMap.get(item.folder_id) || [];
        existing.push(item.chat_id);
        folderItemsMap.set(item.folder_id, existing);
      });

      const foldersWithCount: ChatFolderWithCount[] = (foldersData || []).map(
        (folder) => ({
          ...folder,
          chat_count: folderItemsMap.get(folder.id)?.length || 0,
          chat_ids: folderItemsMap.get(folder.id) || [],
        }),
      );

      setFolders(foldersWithCount);
    } catch (error) {
      console.error("Error fetching folders:", error);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!user || !newFolderName.trim()) return;

    try {
      const { data, error } = await supabase
        .from("chat_folders")
        .insert({
          user_id: user.id,
          name: newFolderName.trim(),
          icon: selectedIcon,
          color: selectedColor,
          position: folders.length,
        })
        .select()
        .single();

      if (error) throw error;

      setFolders((prev) => [...prev, { ...data, chat_count: 0, chat_ids: [] }]);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      resetForm();
      setShowCreateModal(false);
    } catch (error: any) {
      if (error.code === "23505") {
        Alert.alert("Ошибка", "Папка с таким именем уже существует");
      } else {
        console.error("Error creating folder:", error);
        Alert.alert("Ошибка", "Не удалось создать папку");
      }
    }
  };

  const updateFolder = async () => {
    if (!user || !editingFolder || !newFolderName.trim()) return;

    try {
      const { error } = await supabase
        .from("chat_folders")
        .update({
          name: newFolderName.trim(),
          icon: selectedIcon,
          color: selectedColor,
        })
        .eq("id", editingFolder.id);

      if (error) throw error;

      setFolders((prev) =>
        prev.map((f) =>
          f.id === editingFolder.id
            ? {
                ...f,
                name: newFolderName.trim(),
                icon: selectedIcon,
                color: selectedColor,
              }
            : f,
        ),
      );

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      resetForm();
      setShowEditModal(false);
      setEditingFolder(null);
    } catch (error) {
      console.error("Error updating folder:", error);
      Alert.alert("Ошибка", "Не удалось обновить папку");
    }
  };

  const deleteFolder = async (folder: ChatFolderWithCount) => {
    Alert.alert(
      "Удалить папку",
      `Вы уверены, что хотите удалить папку "${folder.name}"? Чаты из папки не будут удалены.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("chat_folders")
                .delete()
                .eq("id", folder.id);

              if (error) throw error;

              setFolders((prev) => prev.filter((f) => f.id !== folder.id));

              if (Platform.OS !== "web") {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            } catch (error) {
              console.error("Error deleting folder:", error);
              Alert.alert("Ошибка", "Не удалось удалить папку");
            }
          },
        },
      ],
    );
  };

  const openEditModal = (folder: ChatFolderWithCount) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setSelectedIcon(folder.icon);
    setSelectedColor(folder.color);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setNewFolderName("");
    setSelectedIcon("folder");
    setSelectedColor("#007AFF");
  };

  const renderFolder = ({ item }: { item: ChatFolderWithCount }) => (
    <TouchableOpacity
      style={[styles.folderItem, { backgroundColor: colors.card }]}
      onPress={() => openEditModal(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.folderIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon as any} size={24} color="#fff" />
      </View>
      <View style={styles.folderInfo}>
        <Text style={[styles.folderName, { color: colors.text }]}>
          {item.name}
        </Text>
        <Text style={[styles.folderCount, { color: colors.textSecondary }]}>
          {item.chat_count}{" "}
          {item.chat_count === 1
            ? "чат"
            : item.chat_count < 5
              ? "чата"
              : "чатов"}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteFolder(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderFolderModal = (isEdit: boolean) => (
    <Modal
      visible={isEdit ? showEditModal : showCreateModal}
      transparent
      animationType="slide"
      onRequestClose={() => {
        isEdit ? setShowEditModal(false) : setShowCreateModal(false);
        resetForm();
        setEditingFolder(null);
      }}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                isEdit ? setShowEditModal(false) : setShowCreateModal(false);
                resetForm();
                setEditingFolder(null);
              }}
            >
              <Text style={[styles.modalCancel, { color: colors.primary }]}>
                Отмена
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isEdit ? "Редактировать" : "Новая папка"}
            </Text>
            <TouchableOpacity
              onPress={isEdit ? updateFolder : createFolder}
              disabled={!newFolderName.trim()}
            >
              <Text
                style={[
                  styles.modalSave,
                  {
                    color: newFolderName.trim()
                      ? colors.primary
                      : colors.textMuted,
                  },
                ]}
              >
                {isEdit ? "Сохранить" : "Создать"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Preview */}
            <View style={styles.previewContainer}>
              <View
                style={[styles.previewIcon, { backgroundColor: selectedColor }]}
              >
                <Ionicons name={selectedIcon as any} size={32} color="#fff" />
              </View>
              <Text style={[styles.previewName, { color: colors.text }]}>
                {newFolderName || "Название папки"}
              </Text>
            </View>

            {/* Name Input */}
            <View style={styles.inputSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Название
              </Text>
              <TextInput
                style={[
                  styles.nameInput,
                  {
                    backgroundColor: colors.inputBackground,
                    color: colors.text,
                    borderColor: colors.borderLight,
                  },
                ]}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Введите название"
                placeholderTextColor={colors.textMuted}
                maxLength={50}
                keyboardAppearance={isDark ? "dark" : "light"}
              />
            </View>

            {/* Icon Selection */}
            <View style={styles.inputSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Иконка
              </Text>
              <View style={styles.iconsGrid}>
                {FOLDER_ICONS.map((icon) => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconOption,
                      {
                        backgroundColor:
                          selectedIcon === icon
                            ? selectedColor
                            : colors.inputBackground,
                      },
                    ]}
                    onPress={() => {
                      setSelectedIcon(icon);
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <Ionicons
                      name={icon as any}
                      size={22}
                      color={selectedIcon === icon ? "#fff" : colors.text}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Color Selection */}
            <View style={styles.inputSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Цвет
              </Text>
              <View style={styles.colorsGrid}>
                {FOLDER_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedColor(color);
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    {selectedColor === color && (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.text === "#1a1a1a" ? "dark-content" : "light-content"}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Папки</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Description */}
      <View style={styles.description}>
        <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
          Создайте папки для организации чатов. Долгое нажатие на чат в списке
          позволит добавить его в папку.
        </Text>
      </View>

      {/* Folders List */}
      {folders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}
          >
            <Ionicons
              name="folder-open-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Нет папок
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Создайте первую папку для организации чатов
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            <Text style={styles.createButtonText}>Создать папку</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={folders}
          renderItem={renderFolder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* Create Modal */}
      {renderFolderModal(false)}

      {/* Edit Modal */}
      {renderFolderModal(true)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  description: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  folderInfo: {
    flex: 1,
    marginLeft: 14,
  },
  folderName: {
    fontSize: 17,
    fontWeight: "600",
  },
  folderCount: {
    fontSize: 14,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  createButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalSave: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  previewContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  previewIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  previewName: {
    fontSize: 20,
    fontWeight: "600",
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nameInput: {
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  colorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
