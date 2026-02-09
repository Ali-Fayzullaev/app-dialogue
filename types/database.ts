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
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
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
        };
        Insert: {
          id?: string;
          name?: string | null;
          is_group?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          is_group?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_members: {
        Row: {
          id: string;
          chat_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          user_id?: string;
          joined_at?: string;
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
          media_type: "image" | "video" | "audio" | null;
          created_at: string;
          updated_at: string | null;
          is_read: boolean;
          reply_to_id: string | null;
        };
        Insert: {
          id?: string;
          chat_id: string;
          sender_id: string;
          content: string;
          media_url?: string | null;
          media_type?: "image" | "video" | "audio" | null;
          created_at?: string;
          updated_at?: string | null;
          is_read?: boolean;
          reply_to_id?: string | null;
        };
        Update: {
          id?: string;
          chat_id?: string;
          sender_id?: string;
          content?: string;
          media_url?: string | null;
          media_type?: "image" | "video" | "audio" | null;
          updated_at?: string | null;
          created_at?: string;
          is_read?: boolean;
          reply_to_id?: string | null;
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

// Расширенный тип сообщения с информацией о профиле отправителя
export interface MessageWithSender extends Message {
  sender: Profile;
}

// Чат с последним сообщением и информацией о других участниках
export interface ChatWithDetails extends Chat {
  last_message?: Message;
  members: Profile[];
}
