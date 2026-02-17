export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          public_key: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          public_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          public_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chats: {
        Row: {
          id: string;
          name: string | null;
          is_group: boolean;
          created_at: string;
          admin_id: string | null;
          avatar_url: string | null;
          description: string | null;
        };
        Insert: {
          id?: string;
          name?: string | null;
          is_group?: boolean;
          created_at?: string;
          admin_id?: string | null;
          avatar_url?: string | null;
          description?: string | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          is_group?: boolean;
          created_at?: string;
          admin_id?: string | null;
          avatar_url?: string | null;
          description?: string | null;
        };
        Relationships: [];
      };
      chat_members: {
        Row: {
          id: string;
          chat_id: string;
          user_id: string;
          joined_at: string;
          role: "admin" | "member";
          is_archived: boolean;
          is_muted: boolean;
        };
        Insert: {
          id?: string;
          chat_id: string;
          user_id: string;
          joined_at?: string;
          role?: "admin" | "member";
          is_archived?: boolean;
          is_muted?: boolean;
        };
        Update: {
          id?: string;
          chat_id?: string;
          user_id?: string;
          joined_at?: string;
          role?: "admin" | "member";
          is_archived?: boolean;
          is_muted?: boolean;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          sender_id: string;
          content: string;
          media_url: string | null;
          media_type: "image" | "video" | "audio" | "location" | "file" | null;
          created_at: string;
          updated_at: string | null;
          is_read: boolean;
          is_delivered: boolean;
          reply_to_id: string | null;
          // Location fields
          latitude: number | null;
          longitude: number | null;
          location_name: string | null;
          // File fields
          file_name: string | null;
          file_size: number | null;
          // Audio waveform data
          audio_waveform: number[] | null;
          audio_duration: number | null;
          // Forward fields
          forwarded_from_id: string | null;
          forwarded_from_username: string | null;
          // Soft delete
          deleted_for_users: string[];
        };
        Insert: {
          id?: string;
          chat_id: string;
          sender_id: string;
          content: string;
          media_url?: string | null;
          media_type?: "image" | "video" | "audio" | "location" | "file" | null;
          created_at?: string;
          updated_at?: string | null;
          is_read?: boolean;
          is_delivered?: boolean;
          reply_to_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          location_name?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          audio_waveform?: number[] | null;
          audio_duration?: number | null;
          forwarded_from_id?: string | null;
          forwarded_from_username?: string | null;
          deleted_for_users?: string[];
        };
        Update: {
          id?: string;
          chat_id?: string;
          sender_id?: string;
          content?: string;
          media_url?: string | null;
          media_type?: "image" | "video" | "audio" | "location" | "file" | null;
          updated_at?: string | null;
          created_at?: string;
          is_read?: boolean;
          is_delivered?: boolean;
          reply_to_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          location_name?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          audio_waveform?: number[] | null;
          audio_duration?: number | null;
          forwarded_from_id?: string | null;
          forwarded_from_username?: string | null;
          deleted_for_users?: string[];
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_presence: {
        Row: {
          user_id: string;
          is_online: boolean;
          last_seen: string;
        };
        Insert: {
          user_id: string;
          is_online?: boolean;
          last_seen?: string;
        };
        Update: {
          user_id?: string;
          is_online?: boolean;
          last_seen?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          chat_id: string;
          caller_id: string;
          receiver_id: string;
          call_type: "audio" | "video";
          status:
            | "pending"
            | "ringing"
            | "active"
            | "ended"
            | "missed"
            | "declined"
            | "failed";
          daily_room_name: string | null;
          daily_room_url: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          caller_id: string;
          receiver_id: string;
          call_type: "audio" | "video";
          status?:
            | "pending"
            | "ringing"
            | "active"
            | "ended"
            | "missed"
            | "declined"
            | "failed";
          daily_room_name?: string | null;
          daily_room_url?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          caller_id?: string;
          receiver_id?: string;
          call_type?: "audio" | "video";
          status?:
            | "pending"
            | "ringing"
            | "active"
            | "ended"
            | "missed"
            | "declined"
            | "failed";
          daily_room_name?: string | null;
          daily_room_url?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_folders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon?: string;
          color?: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string;
          color?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_folder_items: {
        Row: {
          id: string;
          folder_id: string;
          chat_id: string;
          user_id: string;
          added_at: string;
        };
        Insert: {
          id?: string;
          folder_id: string;
          chat_id: string;
          user_id: string;
          added_at?: string;
        };
        Update: {
          id?: string;
          folder_id?: string;
          chat_id?: string;
          user_id?: string;
          added_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          contact_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      blocked_users: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          blocker_id?: string;
          blocked_id?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      pinned_messages: {
        Row: {
          id: string;
          chat_id: string;
          message_id: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          message_id: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          message_id?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // === Stories / Статусы ===
      stories: {
        Row: {
          id: string;
          user_id: string;
          media_url: string;
          media_type: "image" | "video";
          caption: string | null;
          created_at: string;
          expires_at: string;
          privacy: "all" | "contacts_except" | "only_share_with";
        };
        Insert: {
          id?: string;
          user_id: string;
          media_url: string;
          media_type: "image" | "video";
          caption?: string | null;
          created_at?: string;
          expires_at?: string;
          privacy?: "all" | "contacts_except" | "only_share_with";
        };
        Update: {
          id?: string;
          user_id?: string;
          media_url?: string;
          media_type?: "image" | "video";
          caption?: string | null;
          created_at?: string;
          expires_at?: string;
          privacy?: "all" | "contacts_except" | "only_share_with";
        };
        Relationships: [];
      };
      story_views: {
        Row: {
          id: string;
          story_id: string;
          viewer_id: string;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          viewer_id: string;
          viewed_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          viewer_id?: string;
          viewed_at?: string;
        };
        Relationships: [];
      };
      story_privacy_users: {
        Row: {
          id: string;
          user_id: string;
          target_user_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_user_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}

// Удобные типы для использования
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Chat = Database["public"]["Tables"]["chats"]["Row"];
export type ChatMember = Database["public"]["Tables"]["chat_members"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type CallRecord = Database["public"]["Tables"]["calls"]["Row"];

// Роль участника в чате
export type ChatRole = "admin" | "member";

// Участник чата с профилем
export interface ChatMemberWithProfile extends ChatMember {
  profile: Profile;
}

// Расширенный тип сообщения с информацией о профиле отправителя
export interface MessageWithSender extends Message {
  sender: Profile;
}

// Чат с последним сообщением и информацией о других участниках
export interface ChatWithDetails extends Chat {
  last_message?: Message;
  members: Profile[];
  member_count?: number;
  unread_count?: number;
}

// Группа с полной информацией
export interface GroupChatDetails extends Chat {
  members: ChatMemberWithProfile[];
  member_count: number;
  is_admin: boolean;
}

// Реакция на сообщение
export type MessageReaction =
  Database["public"]["Tables"]["message_reactions"]["Row"];

// Закреплённое сообщение
export type PinnedMessage =
  Database["public"]["Tables"]["pinned_messages"]["Row"];

// Реакция с информацией о пользователе
export interface MessageReactionWithUser extends MessageReaction {
  user?: Profile;
}

// Сгруппированные реакции для отображения
export interface GroupedReaction {
  emoji: string;
  count: number;
  users: { id: string; username: string; avatar_url: string | null }[]; // пользователи с профилями
  hasReacted: boolean; // текущий пользователь поставил эту реакцию
}

// Папки чатов
export type ChatFolder = Database["public"]["Tables"]["chat_folders"]["Row"];
export type ChatFolderItem =
  Database["public"]["Tables"]["chat_folder_items"]["Row"];

// Папка с количеством чатов
export interface ChatFolderWithCount extends ChatFolder {
  chat_count: number;
  chat_ids: string[];
}

// Контакты
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];

// Заблокированные пользователи
export type BlockedUser = Database["public"]["Tables"]["blocked_users"]["Row"];

// Заблокированный пользователь с профилем
export interface BlockedUserWithProfile extends BlockedUser {
  profile: Profile;
}

// === Stories / Статусы ===
export type Story = Database["public"]["Tables"]["stories"]["Row"];
export type StoryView = Database["public"]["Tables"]["story_views"]["Row"];
export type StoryPrivacyUser =
  Database["public"]["Tables"]["story_privacy_users"]["Row"];

// История с информацией о пользователе и просмотрах
export interface StoryWithDetails extends Story {
  user: Profile;
  view_count: number;
  is_viewed: boolean; // текущий пользователь уже просмотрел
}

// Группа историй пользователя
export interface UserStories {
  user: Profile;
  stories: StoryWithDetails[];
  hasUnviewed: boolean; // есть непросмотренные
  latestAt: string; // время последней истории
}
