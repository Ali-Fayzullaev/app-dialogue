import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { groupService } from "@/lib/group-service";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
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

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"members" | "info">("members");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const users = await groupService.getAllUsers(user?.id ? [user.id] : []);
      setAllUsers(users);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = searchQuery
    ? allUsers.filter((u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allUsers;

  const toggleMember = (profile: Profile) => {
    safeHaptic();
    setSelectedMembers((prev) => {
      const isSelected = prev.some((p) => p.id === profile.id);
      if (isSelected) {
        return prev.filter((p) => p.id !== profile.id);
      }
      return [...prev, profile];
    });
  };

  const handlePickAvatar = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Загрузка аватара недоступна в веб-версии");
      return;
    }

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
      setUploadingAvatar(true);
      try {
        const asset = result.assets[0];
        const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `group_${Date.now()}.${fileExt}`;

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
      } catch (error) {
        console.error("Error uploading avatar:", error);
        Alert.alert("Ошибка", "Не удалось загрузить фото");
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const handleNext = () => {
    if (selectedMembers.length === 0) {
      Alert.alert("Ошибка", "Выберите хотя бы одного участника");
      return;
    }
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setStep("info");
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert("Ошибка", "Введите название группы");
      return;
    }

    if (!user) return;

    setCreating(true);
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const group = await groupService.createGroup({
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        avatarUrl: groupAvatar || undefined,
        memberIds: selectedMembers.map((m) => m.id),
        adminId: user.id,
      });

      if (group) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/chat/${group.id}`);
      } else {
        throw new Error("Failed to create group");
      }
    } catch (error) {
      console.error("Error creating group:", error);
      Alert.alert("Ошибка", "Не удалось создать группу");
    } finally {
      setCreating(false);
    }
  };

  const renderUser = ({ item }: { item: Profile }) => {
    const isSelected = selectedMembers.some((p) => p.id === item.id);
    const avatarColor = getAvatarColor(item.id);

    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleMember(item)}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
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

        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.username}</Text>
        </View>

        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
      </TouchableOpacity>
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
            if (step === "info") {
              setStep("members");
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {step === "members" ? "Новая группа" : "Настройки группы"}
        </Text>

        {step === "members" ? (
          <TouchableOpacity
            style={[
              styles.nextButton,
              selectedMembers.length === 0 && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={selectedMembers.length === 0}
          >
            <Text
              style={[
                styles.nextButtonText,
                selectedMembers.length === 0 && styles.nextButtonTextDisabled,
              ]}
            >
              Далее
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, creating && styles.nextButtonDisabled]}
            onPress={handleCreate}
            disabled={creating || !groupName.trim()}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.nextButtonText}>Создать</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {step === "members" ? (
        <>
          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <View style={styles.selectedContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedScroll}
              >
                {selectedMembers.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.selectedMember}
                    onPress={() => toggleMember(member)}
                  >
                    {member.avatar_url ? (
                      <Image
                        source={{ uri: member.avatar_url }}
                        style={styles.selectedAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.selectedAvatarPlaceholder,
                          { backgroundColor: getAvatarColor(member.id) },
                        ]}
                      >
                        <Text style={styles.selectedAvatarText}>
                          {member.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.removeButton}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                    <Text style={styles.selectedName} numberOfLines={1}>
                      {member.username}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color={colors.textMuted}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск пользователей..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Users list */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.usersList}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? "Пользователи не найдены"
                    : "Нет пользователей"}
                </Text>
              </View>
            }
          />
        </>
      ) : (
        <ScrollView style={styles.infoContainer}>
          {/* Group avatar */}
          <TouchableOpacity
            style={styles.avatarPicker}
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : groupAvatar ? (
              <Image source={{ uri: groupAvatar }} style={styles.groupAvatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="camera" size={32} color={colors.textMuted} />
                <Text style={styles.avatarPlaceholderText}>Добавить фото</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Group name */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Название группы *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Введите название..."
              placeholderTextColor={colors.textMuted}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
          </View>

          {/* Group description */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Описание (необязательно)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Расскажите о группе..."
              placeholderTextColor={colors.textMuted}
              value={groupDescription}
              onChangeText={setGroupDescription}
              multiline
              maxLength={200}
            />
          </View>

          {/* Members preview */}
          <View style={styles.membersPreview}>
            <Text style={styles.membersPreviewTitle}>
              Участники ({selectedMembers.length + 1})
            </Text>
            <Text style={styles.membersPreviewSubtitle}>
              Вы, {selectedMembers.map((m) => m.username).join(", ")}
            </Text>
          </View>
        </ScrollView>
      )}
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
  nextButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textLight,
  },
  nextButtonTextDisabled: {
    opacity: 0.5,
  },
  selectedContainer: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  selectedMember: {
    alignItems: "center",
    width: 60,
  },
  selectedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  selectedAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textLight,
  },
  removeButton: {
    position: "absolute",
    top: -2,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedName: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  usersList: {
    paddingBottom: 20,
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
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  userAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textLight,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  infoContainer: {
    flex: 1,
    padding: 20,
  },
  avatarPicker: {
    alignSelf: "center",
    marginBottom: 24,
  },
  groupAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  avatarPlaceholderText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  membersPreview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  membersPreviewTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  membersPreviewSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
