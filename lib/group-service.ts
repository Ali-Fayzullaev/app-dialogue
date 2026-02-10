import {
    Chat,
    ChatMemberWithProfile,
    GroupChatDetails,
    Profile,
} from "@/types/database";
import { supabase } from "./supabase";

export interface CreateGroupParams {
  name: string;
  description?: string;
  avatarUrl?: string;
  memberIds: string[];
  adminId: string;
}

export interface UpdateGroupParams {
  name?: string;
  description?: string;
  avatarUrl?: string;
}

/**
 * Сервис для работы с групповыми чатами
 */
export const groupService = {
  /**
   * Создать групповой чат
   */
  async createGroup(params: CreateGroupParams): Promise<Chat | null> {
    const { name, description, avatarUrl, memberIds, adminId } = params;

    try {
      // Создаём чат
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .insert({
          name,
          description,
          avatar_url: avatarUrl,
          is_group: true,
          admin_id: adminId,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Добавляем админа как участника
      const members = [
        { chat_id: chat.id, user_id: adminId, role: "admin" as const },
        ...memberIds
          .filter((id) => id !== adminId)
          .map((id) => ({
            chat_id: chat.id,
            user_id: id,
            role: "member" as const,
          })),
      ];

      const { error: membersError } = await supabase
        .from("chat_members")
        .insert(members);

      if (membersError) throw membersError;

      return chat;
    } catch (error) {
      console.error("Error creating group:", error);
      return null;
    }
  },

  /**
   * Получить информацию о группе
   */
  async getGroupDetails(
    chatId: string,
    userId: string,
  ): Promise<GroupChatDetails | null> {
    try {
      // Получаем чат
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (chatError) throw chatError;

      // Получаем участников
      const { data: members, error: membersError } = await supabase
        .from("chat_members")
        .select("*")
        .eq("chat_id", chatId);

      if (membersError) throw membersError;

      // Получаем профили участников отдельно
      const userIds = (members || []).map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const membersWithProfiles: ChatMemberWithProfile[] = (members || []).map(
        (m) => ({
          ...m,
          profile: profileMap.get(m.user_id) as Profile,
        }),
      );

      // Пользователь админ если он главный админ ИЛИ имеет роль админа
      const userMember = membersWithProfiles.find((m) => m.user_id === userId);
      const isAdmin = chat.admin_id === userId || userMember?.role === "admin";

      return {
        ...chat,
        members: membersWithProfiles,
        member_count: membersWithProfiles.length,
        is_admin: isAdmin,
      };
    } catch (error) {
      console.error("Error getting group details:", error);
      return null;
    }
  },

  /**
   * Обновить информацию о группе
   */
  async updateGroup(
    chatId: string,
    params: UpdateGroupParams,
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("chats")
        .update({
          name: params.name,
          description: params.description,
          avatar_url: params.avatarUrl,
        })
        .eq("id", chatId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error updating group:", error);
      return false;
    }
  },

  /**
   * Добавить участника в группу
   */
  async addMember(chatId: string, userId: string): Promise<boolean> {
    try {
      // Проверяем, не является ли уже участником
      const { data: existing } = await supabase
        .from("chat_members")
        .select("id")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .single();

      if (existing) {
        console.log("User is already a member");
        return true;
      }

      const { error } = await supabase.from("chat_members").insert({
        chat_id: chatId,
        user_id: userId,
        role: "member",
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error adding member:", error);
      return false;
    }
  },

  /**
   * Добавить несколько участников
   */
  async addMembers(chatId: string, userIds: string[]): Promise<boolean> {
    try {
      // Получаем существующих участников
      const { data: existingMembers } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", chatId);

      const existingIds = new Set(existingMembers?.map((m) => m.user_id) || []);

      // Фильтруем новых участников
      const newMembers = userIds
        .filter((id) => !existingIds.has(id))
        .map((id) => ({
          chat_id: chatId,
          user_id: id,
          role: "member" as const,
        }));

      if (newMembers.length === 0) return true;

      const { error } = await supabase.from("chat_members").insert(newMembers);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error adding members:", error);
      return false;
    }
  },

  /**
   * Удалить участника из группы
   */
  async removeMember(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("chat_members")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error removing member:", error);
      return false;
    }
  },

  /**
   * Назначить администратора (добавить роль админа)
   */
  async makeAdmin(chatId: string, userId: string): Promise<boolean> {
    try {
      // Обновляем только роль участника на админа
      const { error: memberError } = await supabase
        .from("chat_members")
        .update({ role: "admin" })
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (memberError) throw memberError;

      return true;
    } catch (error) {
      console.error("Error making admin:", error);
      return false;
    }
  },

  /**
   * Снять с администратора
   */
  async removeAdmin(chatId: string, userId: string): Promise<boolean> {
    try {
      // Проверяем, не является ли пользователь главным админом
      const { data: chat } = await supabase
        .from("chats")
        .select("admin_id")
        .eq("id", chatId)
        .single();

      // Главного админа нельзя понизить
      if (chat?.admin_id === userId) {
        return false;
      }

      // Снимаем роль админа
      const { error } = await supabase
        .from("chat_members")
        .update({ role: "member" })
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error("Error removing admin:", error);
      return false;
    }
  },

  /**
   * Покинуть группу
   */
  async leaveGroup(chatId: string, userId: string): Promise<boolean> {
    try {
      // Проверяем, является ли пользователь главным админом
      const { data: chat } = await supabase
        .from("chats")
        .select("admin_id")
        .eq("id", chatId)
        .single();

      if (chat?.admin_id === userId) {
        // Главный админ уходит - сначала ищем других админов
        const { data: otherAdmins } = await supabase
          .from("chat_members")
          .select("user_id, role")
          .eq("chat_id", chatId)
          .eq("role", "admin")
          .neq("user_id", userId)
          .limit(1);

        let newAdminId: string | null = null;

        if (otherAdmins && otherAdmins.length > 0) {
          // Назначаем другого админа главным
          newAdminId = otherAdmins[0].user_id;
        } else {
          // Нет других админов - выбираем любого участника
          const { data: members } = await supabase
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", chatId)
            .neq("user_id", userId)
            .limit(1);

          if (members && members.length > 0) {
            newAdminId = members[0].user_id;
          }
        }

        if (newAdminId) {
          // Обновляем главного админа
          await supabase
            .from("chats")
            .update({ admin_id: newAdminId })
            .eq("id", chatId);

          // Даём ему роль админа если ещё нет
          await supabase
            .from("chat_members")
            .update({ role: "admin" })
            .eq("chat_id", chatId)
            .eq("user_id", newAdminId);
        }
      }

      // Удаляем участника
      const { error } = await supabase
        .from("chat_members")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error leaving group:", error);
      return false;
    }
  },

  /**
   * Очистить историю чата (удалить все сообщения)
   */
  async clearChatHistory(chatId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("chat_id", chatId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error clearing chat history:", error);
      return false;
    }
  },

  /**
   * Удалить группу (только для админа)
   */
  async deleteGroup(chatId: string): Promise<boolean> {
    try {
      // Удаляем все сообщения
      await supabase.from("messages").delete().eq("chat_id", chatId);

      // Удаляем всех участников
      await supabase.from("chat_members").delete().eq("chat_id", chatId);

      // Удаляем чат
      const { error } = await supabase.from("chats").delete().eq("id", chatId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error deleting group:", error);
      return false;
    }
  },

  /**
   * Поиск пользователей для добавления в группу
   */
  async searchUsers(
    query: string,
    excludeIds: string[] = [],
  ): Promise<Profile[]> {
    try {
      let queryBuilder = supabase
        .from("profiles")
        .select("*")
        .ilike("username", `%${query}%`)
        .limit(20);

      if (excludeIds.length > 0) {
        queryBuilder = queryBuilder.not(
          "id",
          "in",
          `(${excludeIds.join(",")})`,
        );
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error searching users:", error);
      return [];
    }
  },

  /**
   * Получить всех пользователей (для выбора участников)
   */
  async getAllUsers(excludeIds: string[] = []): Promise<Profile[]> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("username");

      if (error) throw error;

      return (data || []).filter((p) => !excludeIds.includes(p.id));
    } catch (error) {
      console.error("Error getting users:", error);
      return [];
    }
  },
};
