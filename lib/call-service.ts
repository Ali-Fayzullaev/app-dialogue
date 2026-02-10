import { supabase } from "./supabase";

// Daily.co API configuration
const DAILY_API_KEY =
  "6f9ec9d891cab6a6b3ae4a7bcc6c40c46bc93b99d3e7d11ad46c8e320d99b4de";
const DAILY_API_URL = "https://api.daily.co/v1";

export type CallType = "audio" | "video";
export type CallStatus =
  | "pending"
  | "ringing"
  | "active"
  | "ended"
  | "missed"
  | "declined"
  | "failed";

export interface Call {
  id: string;
  chat_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: CallType;
  status: CallStatus;
  daily_room_name: string | null;
  daily_room_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface DailyRoom {
  id: string;
  name: string;
  url: string;
  created_at: string;
  config: {
    exp?: number;
    nbf?: number;
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
  };
}

// Создать комнату Daily.co
async function createDailyRoom(
  roomName: string,
  expiryMinutes: number = 60,
): Promise<DailyRoom | null> {
  try {
    const expiry = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: expiry,
          max_participants: 10,
          enable_chat: false,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Daily.co room creation error:", error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Create Daily room error:", error);
    return null;
  }
}

// Удалить комнату Daily.co
async function deleteDailyRoom(roomName: string): Promise<boolean> {
  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
    });

    return response.ok || response.status === 404;
  } catch (error) {
    console.error("Delete Daily room error:", error);
    return false;
  }
}

// Создать токен для участника
async function createMeetingToken(
  roomName: string,
  userId: string,
  userName: string,
  isOwner: boolean = false,
): Promise<string | null> {
  try {
    const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 час

    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: userId,
          user_name: userName,
          is_owner: isOwner,
          exp: expiry,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Daily.co token creation error:", error);
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Create meeting token error:", error);
    return null;
  }
}

// Начать звонок
export async function initiateCall(
  chatId: string,
  callerId: string,
  receiverId: string,
  callType: CallType,
): Promise<{ call: Call; roomUrl: string; token: string } | null> {
  try {
    // Генерируем уникальное имя комнаты
    const roomName = `call_${chatId}_${Date.now()}`;

    // Создаём комнату в Daily.co
    const room = await createDailyRoom(roomName);
    if (!room) {
      console.error("Failed to create Daily room");
      return null;
    }

    // Получаем имя звонящего
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", callerId)
      .single();

    // Создаём токен для звонящего
    const token = await createMeetingToken(
      roomName,
      callerId,
      callerProfile?.username || "Пользователь",
      true,
    );

    if (!token) {
      await deleteDailyRoom(roomName);
      return null;
    }

    // Создаём запись о звонке в БД
    const { data: call, error } = await supabase
      .from("calls")
      .insert({
        chat_id: chatId,
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: callType,
        status: "ringing",
        daily_room_name: roomName,
        daily_room_url: room.url,
      })
      .select()
      .single();

    if (error || !call) {
      console.error("Failed to create call record:", error);
      await deleteDailyRoom(roomName);
      return null;
    }

    return {
      call,
      roomUrl: room.url,
      token,
    };
  } catch (error) {
    console.error("Initiate call error:", error);
    return null;
  }
}

// Принять звонок
export async function acceptCall(
  callId: string,
  userId: string,
): Promise<{ roomUrl: string; token: string } | null> {
  try {
    // Получаем информацию о звонке
    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", callId)
      .single();

    if (fetchError || !call) {
      console.error("Call not found:", fetchError);
      return null;
    }

    if (!call.daily_room_name || !call.daily_room_url) {
      console.error("Call has no room");
      return null;
    }

    // Получаем имя принимающего
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    // Создаём токен для принимающего
    const token = await createMeetingToken(
      call.daily_room_name,
      userId,
      userProfile?.username || "Пользователь",
      false,
    );

    if (!token) {
      return null;
    }

    // Обновляем статус звонка
    const { error: updateError } = await supabase
      .from("calls")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", callId);

    if (updateError) {
      console.error("Failed to update call status:", updateError);
    }

    return {
      roomUrl: call.daily_room_url,
      token,
    };
  } catch (error) {
    console.error("Accept call error:", error);
    return null;
  }
}

// Отклонить звонок
export async function declineCall(callId: string): Promise<boolean> {
  try {
    const { data: call } = await supabase
      .from("calls")
      .select("daily_room_name")
      .eq("id", callId)
      .single();

    const { error } = await supabase
      .from("calls")
      .update({
        status: "declined",
        ended_at: new Date().toISOString(),
      })
      .eq("id", callId);

    if (error) {
      console.error("Failed to decline call:", error);
      return false;
    }

    // Удаляем комнату
    if (call?.daily_room_name) {
      await deleteDailyRoom(call.daily_room_name);
    }

    return true;
  } catch (error) {
    console.error("Decline call error:", error);
    return false;
  }
}

// Завершить звонок
export async function endCall(callId: string): Promise<boolean> {
  try {
    const { data: call } = await supabase
      .from("calls")
      .select("daily_room_name, status")
      .eq("id", callId)
      .single();

    const newStatus = call?.status === "ringing" ? "missed" : "ended";

    const { error } = await supabase
      .from("calls")
      .update({
        status: newStatus,
        ended_at: new Date().toISOString(),
      })
      .eq("id", callId);

    if (error) {
      console.error("Failed to end call:", error);
      return false;
    }

    // Удаляем комнату
    if (call?.daily_room_name) {
      await deleteDailyRoom(call.daily_room_name);
    }

    return true;
  } catch (error) {
    console.error("End call error:", error);
    return false;
  }
}

// Получить активные звонки для пользователя
export async function getActiveCallsForUser(userId: string): Promise<Call[]> {
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
      .in("status", ["pending", "ringing", "active"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to get active calls:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Get active calls error:", error);
    return [];
  }
}

// Получить историю звонков для чата
export async function getCallHistory(
  chatId: string,
  limit: number = 20,
): Promise<Call[]> {
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to get call history:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Get call history error:", error);
    return [];
  }
}

// Подписка на изменения звонков
export function subscribeToCallsForUser(
  userId: string,
  onCallUpdate: (call: Call) => void,
) {
  const channel = supabase
    .channel(`calls_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "calls",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          onCallUpdate(payload.new as Call);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "calls",
        filter: `caller_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          onCallUpdate(payload.new as Call);
        }
      },
    )
    .subscribe();

  return channel;
}

// Форматирование длительности звонка
export function formatCallDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} сек`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${remainingMinutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}
