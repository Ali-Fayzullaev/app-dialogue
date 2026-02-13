import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { groupService } from "@/lib/group-service";
import { supabase } from "@/lib/supabase";
import { ChatMemberWithProfile, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatMemberWithProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedNewMembers, setSelectedNewMembers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [viewingMemberAvatar, setViewingMemberAvatar] =
    useState<Profile | null>(null);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    if (!id || !user) return;

    try {
      const details = await groupService.getGroupDetails(id, user.id);
      if (details) {
        setGroupName(details.name || "");
        setGroupDescription(details.description || "");
        setGroupAvatar(details.avatar_url);
        setMembers(details.members);
        setIsAdmin(details.is_admin);
      }
    } catch (error) {
      console.error("Error fetching group:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    const memberIds = members.map((m) => m.user_id);
    const users = await groupService.getAllUsers(memberIds);
    setAvailableUsers(users);
  };

  const handleOpenAddMembers = async () => {
    safeHaptic();
    await fetchAvailableUsers();
    setShowAddMembers(true);
  };

  const toggleNewMember = (profile: Profile) => {
    safeHaptic();
    setSelectedNewMembers((prev) => {
      const isSelected = prev.some((p) => p.id === profile.id);
      if (isSelected) {
        return prev.filter((p) => p.id !== profile.id);
      }
      return [...prev, profile];
    });
  };

  const handleAddMembers = async () => {
    if (selectedNewMembers.length === 0) return;

    setSaving(true);
    try {
      const success = await groupService.addMembers(
        id!,
        selectedNewMembers.map((m) => m.id),
      );

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddMembers(false);
        setSelectedNewMembers([]);
        fetchGroupDetails();
      }
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось добавить участников");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = (member: ChatMemberWithProfile) => {
    if (!isAdmin) return;
    if (member.user_id === user?.id) {
      Alert.alert("Ошибка", "Вы не можете удалить себя");
      return;
    }

    Alert.alert(
      "Удалить участника",
      `Удалить ${member.profile.username} из группы?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            const success = await groupService.removeMember(
              id!,
              member.user_id,
            );
            if (success) {
              fetchGroupDetails();
            }
          },
        },
      ],
    );
  };

  const handleMakeAdmin = (member: ChatMemberWithProfile) => {
    if (!isAdmin || member.role === "admin") return;

    Alert.alert(
      "Назначить админом",
      `Сделать ${member.profile.username} админом группы?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Назначить",
          onPress: async () => {
            const success = await groupService.makeAdmin(id!, member.user_id);
            if (success) {
              fetchGroupDetails();
            }
          },
        },
      ],
    );
  };

  const handleRemoveAdmin = (member: ChatMemberWithProfile) => {
    if (!isAdmin || member.role !== "admin") return;

    Alert.alert(
      "Снять с админа",
      `Снять ${member.profile.username} с админа?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Снять",
          onPress: async () => {
            const success = await groupService.removeAdmin(id!, member.user_id);
            if (success) {
              fetchGroupDetails();
            } else {
              Alert.alert("Ошибка", "Невозможно снять главного админа");
            }
          },
        },
      ],
    );
  };

  const handlePickAvatar = async () => {
    if (Platform.OS === "web" || !isAdmin) return;

    safeHaptic();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Ошибка", "Нужен доступ к галерее");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSaving(true);
      try {
        const asset = result.assets[0];
        const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `group_${id}_${Date.now()}.${fileExt}`;

        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "base64",
        });

        const { data, error } = await supabase.storage
          .from("chat-media")
          .upload(fileName, decode(base64), {
            contentType: `image/${fileExt}`,
            upsert: true,
          });

        if (error) throw error;

        const {
          data: { publicUrl },
        } = supabase.storage.from("chat-media").getPublicUrl(data.path);

        setGroupAvatar(publicUrl);

        await groupService.updateGroup(id!, { avatarUrl: publicUrl });
      } catch (error) {
        console.error("Error uploading avatar:", error);
        Alert.alert("Ошибка", "Не удалось загрузить фото");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveChanges = async () => {
    if (!isAdmin) return;

    setSaving(true);
    try {
      const success = await groupService.updateGroup(id!, {
        name: groupName.trim(),
        description: groupDescription.trim(),
      });

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditMode(false);
      }
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert("Покинуть группу", "Вы уверены, что хотите покинуть группу?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Покинуть",
        style: "destructive",
        onPress: async () => {
          const success = await groupService.leaveGroup(id!, user!.id);
          if (success) {
            router.replace("/(tabs)");
          }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    if (!isAdmin) return;

    Alert.alert(
      "Удалить группу",
      "Это действие нельзя отменить. Все сообщения будут удалены.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            const success = await groupService.deleteGroup(id!);
            if (success) {
              router.replace("/(tabs)");
            }
          },
        },
      ],
    );
  };

  const showMemberOptions = (member: ChatMemberWithProfile) => {
    if (!isAdmin || member.user_id === user?.id) return;

    const isMemberAdmin = member.role === "admin";
    const adminActionText = isMemberAdmin
      ? "Снять с админа"
      : "Сделать админом";

    const options = ["Удалить из группы", adminActionText, "Отмена"];
    const destructiveButtonIndex = 0;
    const cancelButtonIndex = 2;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleRemoveMember(member);
          } else if (buttonIndex === 1) {
            if (isMemberAdmin) {
              handleRemoveAdmin(member);
            } else {
              handleMakeAdmin(member);
            }
          }
        },
      );
    } else {
      Alert.alert(member.profile.username, "Выберите действие", [
        {
          text: "Удалить из группы",
          onPress: () => handleRemoveMember(member),
          style: "destructive",
        },
        {
          text: adminActionText,
          onPress: () => {
            if (isMemberAdmin) {
              handleRemoveAdmin(member);
            } else {
              handleMakeAdmin(member);
            }
          },
        },
        { text: "Отмена", style: "cancel" },
      ]);
    }
  };

  const filteredUsers = searchQuery
    ? availableUsers.filter((u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : availableUsers;

  const renderMember = ({ item }: { item: ChatMemberWithProfile }) => {
    const avatarColor = getAvatarColor(item.profile.id);
    const isCurrentUser = item.user_id === user?.id;

    return (
      <View style={styles.memberItem}>
        <TouchableOpacity
          onPress={() => {
            safeHaptic();
            setViewingMemberAvatar(item.profile);
          }}
          activeOpacity={0.8}
        >
          {item.profile.avatar_url ? (
            <Image
              source={{ uri: item.profile.avatar_url }}
              style={styles.memberAvatar}
            />
          ) : (
            <View
              style={[
                styles.memberAvatarPlaceholder,
                { backgroundColor: avatarColor },
              ]}
            >
              <Text style={styles.memberAvatarText}>
                {item.profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.memberInfo}
          onLongPress={() => showMemberOptions(item)}
          onPress={() => {
            if (isAdmin && !isCurrentUser) {
              showMemberOptions(item);
            } else {
              safeHaptic();
              setViewingMemberAvatar(item.profile);
            }
          }}
          activeOpacity={isAdmin && !isCurrentUser ? 0.7 : 0.8}
        >
          <Text style={styles.memberName}>
            {item.profile.username}
            {isCurrentUser && " (Вы)"}
          </Text>
          {item.role === "admin" && (
            <Text style={styles.memberRole}>Админ</Text>
          )}
        </TouchableOpacity>

        {isAdmin && !isCurrentUser && (
          <TouchableOpacity
            onPress={() => showMemberOptions(item)}
            style={styles.memberOptionsButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Настройки группы</Text>

        {isAdmin && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              if (editMode) {
                handleSaveChanges();
              } else {
                setEditMode(true);
              }
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.textLight} />
            ) : (
              <Text style={styles.editButtonText}>
                {editMode ? "Сохранить" : "Изменить"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Group info */}
        <View style={styles.groupInfoSection}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => {
              safeHaptic();
              if (groupAvatar) {
                setShowAvatarViewer(true);
              } else if (isAdmin) {
                handlePickAvatar();
              }
            }}
            activeOpacity={0.8}
          >
            {groupAvatar ? (
              <Image source={{ uri: groupAvatar }} style={styles.groupAvatar} />
            ) : (
              <View style={styles.groupAvatarPlaceholder}>
                <Ionicons name="people" size={40} color={colors.textMuted} />
              </View>
            )}
            {isAdmin && (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {editMode ? (
            <>
              <TextInput
                style={styles.nameInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Название группы"
                placeholderTextColor={colors.textMuted}
                maxLength={50}
                keyboardAppearance={isDark ? "dark" : "light"}
              />
              <TextInput
                style={styles.descriptionInput}
                value={groupDescription}
                onChangeText={setGroupDescription}
                placeholder="Описание группы"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200}
                keyboardAppearance={isDark ? "dark" : "light"}
              />
            </>
          ) : (
            <>
              <Text style={styles.groupName}>{groupName}</Text>
              {groupDescription ? (
                <Text style={styles.groupDescription}>{groupDescription}</Text>
              ) : null}
              <Text style={styles.memberCount}>
                {members.length} участник
                {members.length === 1 ? "" : members.length < 5 ? "а" : "ов"}
              </Text>
            </>
          )}
        </View>

        {/* Members */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Участники</Text>
            {isAdmin && (
              <TouchableOpacity onPress={handleOpenAddMembers}>
                <Ionicons name="person-add" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            scrollEnabled={false}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {isAdmin && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                Alert.alert(
                  "Очистить историю",
                  "Удалить все сообщения в группе? Это действие нельзя отменить.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Очистить",
                      style: "destructive",
                      onPress: async () => {
                        const success = await groupService.clearChatHistory(
                          id!,
                        );
                        if (success) {
                          Alert.alert("Готово", "История чата очищена");
                        } else {
                          Alert.alert("Ошибка", "Не удалось очистить историю");
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <Ionicons
                name="trash-bin-outline"
                size={22}
                color={colors.warning}
              />
              <Text
                style={[styles.actionButtonText, { color: colors.warning }]}
              >
                Очистить историю
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLeaveGroup}
          >
            <Ionicons name="exit-outline" size={22} color={colors.error} />
            <Text style={[styles.actionButtonText, { color: colors.error }]}>
              Покинуть группу
            </Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDeleteGroup}
            >
              <Ionicons name="trash-outline" size={22} color={colors.error} />
              <Text style={[styles.actionButtonText, { color: colors.error }]}>
                Удалить группу
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembers}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddMembers(false)}>
              <Text style={styles.modalCancel}>Отмена</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Добавить участников</Text>
            <TouchableOpacity
              onPress={handleAddMembers}
              disabled={selectedNewMembers.length === 0 || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.modalDone,
                    selectedNewMembers.length === 0 && styles.modalDoneDisabled,
                  ]}
                >
                  Готово
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedNewMembers.some(
                (p) => p.id === item.id,
              );
              const avatarColor = getAvatarColor(item.id);

              return (
                <TouchableOpacity
                  style={[
                    styles.userItem,
                    isSelected && styles.userItemSelected,
                  ]}
                  onPress={() => toggleNewMember(item)}
                >
                  {item.avatar_url ? (
                    <Image
                      source={{ uri: item.avatar_url }}
                      style={styles.userAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.userAvatarPlaceholder,
                        { backgroundColor: avatarColor },
                      ]}
                    >
                      <Text style={styles.userAvatarText}>
                        {item.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.userName}>{item.username}</Text>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Нет доступных пользователей
                </Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Avatar Viewer Modal */}
      <Modal
        visible={showAvatarViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAvatarViewer(false)}
      >
        <View style={styles.avatarViewerOverlay}>
          <TouchableOpacity
            style={styles.avatarViewerCloseButton}
            onPress={() => setShowAvatarViewer(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {groupAvatar && (
            <Image
              source={{ uri: groupAvatar }}
              style={styles.avatarViewerImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.avatarViewerInfo}>
            <Text style={styles.avatarViewerName}>{groupName}</Text>
            <Text style={styles.avatarViewerSubtitle}>
              {members.length} участник
              {members.length === 1 ? "" : members.length < 5 ? "а" : "ов"}
            </Text>
          </View>

          {isAdmin && (
            <TouchableOpacity
              style={styles.avatarViewerChangeButton}
              onPress={() => {
                setShowAvatarViewer(false);
                setTimeout(() => handlePickAvatar(), 300);
              }}
            >
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.avatarViewerChangeText}>Изменить фото</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* Member Avatar Viewer Modal */}
      <Modal
        visible={!!viewingMemberAvatar}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingMemberAvatar(null)}
      >
        <View style={styles.avatarViewerOverlay}>
          <TouchableOpacity
            style={styles.avatarViewerCloseButton}
            onPress={() => setViewingMemberAvatar(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {viewingMemberAvatar?.avatar_url ? (
            <Image
              source={{ uri: viewingMemberAvatar.avatar_url }}
              style={styles.avatarViewerImage}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.avatarViewerPlaceholder,
                {
                  backgroundColor: viewingMemberAvatar
                    ? getAvatarColor(viewingMemberAvatar.id)
                    : colors.primary,
                },
              ]}
            >
              <Text style={styles.avatarViewerPlaceholderText}>
                {viewingMemberAvatar?.username?.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.avatarViewerInfo}>
            <Text style={styles.avatarViewerName}>
              {viewingMemberAvatar?.username}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.avatarViewerActionButton}
            onPress={() => {
              if (viewingMemberAvatar) {
                setViewingMemberAvatar(null);
                router.push(`/profile/${viewingMemberAvatar.id}` as any);
              }
            }}
          >
            <Ionicons name="person-outline" size={20} color="#fff" />
            <Text style={styles.avatarViewerChangeText}>Открыть профиль</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 16,
    paddingBottom: 16,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textLight,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textLight,
  },
  content: {
    flex: 1,
  },
  groupInfoSection: {
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 8,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  groupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  groupAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  groupName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  memberCount: {
    fontSize: 14,
    color: colors.textMuted,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 8,
    marginHorizontal: 32,
    marginBottom: 12,
  },
  descriptionInput: {
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 32,
    minHeight: 60,
  },
  section: {
    paddingTop: 16,
    borderBottomWidth: 8,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textLight,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
  },
  memberRole: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 2,
  },
  actionsSection: {
    paddingVertical: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 16 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  modalCancel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalDone: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  modalDoneDisabled: {
    opacity: 0.5,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  userItemSelected: {
    backgroundColor: `${colors.primary}10`,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textLight,
  },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
    marginLeft: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  memberOptionsButton: {
    padding: 8,
  },
  avatarViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarViewerCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  avatarViewerImage: {
    width: "90%",
    height: "60%",
    borderRadius: 8,
  },
  avatarViewerPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarViewerPlaceholderText: {
    fontSize: 72,
    fontWeight: "700",
    color: colors.textLight,
  },
  avatarViewerInfo: {
    marginTop: 24,
    alignItems: "center",
  },
  avatarViewerName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  avatarViewerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  avatarViewerChangeButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 60 : 30,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 24,
    gap: 8,
  },
  avatarViewerActionButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 60 : 30,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 24,
    gap: 8,
  },
  avatarViewerChangeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
