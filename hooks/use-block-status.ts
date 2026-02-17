import { supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

const safeNotificationHaptic = (
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType
    .Success,
) => {
  if (Platform.OS !== "web") {
    Haptics.notificationAsync(type);
  }
};

export function useBlockStatus(
  userId: string | undefined,
  chatId: string | undefined,
  isGroup: boolean,
) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedByOther, setIsBlockedByOther] = useState(false);
  const blockChannelRef = useRef<RealtimeChannel | null>(null);

  const checkBlockStatus = useCallback(async () => {
    if (!userId || !chatId || isGroup) return;

    try {
      const { data: members } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", chatId);

      const otherMemberIds =
        members?.filter((m) => m.user_id !== userId).map((m) => m.user_id) ||
        [];
      if (otherMemberIds.length === 0) return;

      const otherUserId = otherMemberIds[0];

      const { data: blockedByMe } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", userId)
        .eq("blocked_id", otherUserId)
        .maybeSingle();

      setIsBlocked(!!blockedByMe);

      const { data: blockedByOther } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", otherUserId)
        .eq("blocked_id", userId)
        .maybeSingle();

      setIsBlockedByOther(!!blockedByOther);
    } catch (error) {
      console.error("Error checking block status:", error);
    }
  }, [userId, chatId, isGroup]);

  const subscribeToBlockStatus = useCallback(() => {
    if (!userId || !chatId || isGroup) return;

    blockChannelRef.current = supabase
      .channel(`block-status:${chatId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blocked_users",
        },
        async (payload) => {
          const { data: members } = await supabase
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", chatId);

          const otherMemberIds =
            members
              ?.filter((m) => m.user_id !== userId)
              .map((m) => m.user_id) || [];
          if (otherMemberIds.length === 0) return;

          const otherUserId = otherMemberIds[0];

          if (payload.eventType === "INSERT") {
            const newBlock = payload.new as {
              blocker_id: string;
              blocked_id: string;
            };

            if (
              newBlock.blocker_id === userId &&
              newBlock.blocked_id === otherUserId
            ) {
              setIsBlocked(true);
              safeNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
            } else if (
              newBlock.blocker_id === otherUserId &&
              newBlock.blocked_id === userId
            ) {
              setIsBlockedByOther(true);
              safeNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
            }
          } else if (payload.eventType === "DELETE") {
            const oldBlock = payload.old as {
              blocker_id?: string;
              blocked_id?: string;
            };

            if (oldBlock.blocker_id && oldBlock.blocked_id) {
              if (
                oldBlock.blocker_id === userId &&
                oldBlock.blocked_id === otherUserId
              ) {
                setIsBlocked(false);
                safeNotificationHaptic(
                  Haptics.NotificationFeedbackType.Success,
                );
              } else if (
                oldBlock.blocker_id === otherUserId &&
                oldBlock.blocked_id === userId
              ) {
                setIsBlockedByOther(false);
                safeNotificationHaptic(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            } else {
              // Fallback: перепроверяем статус
              const { data: blockedByMe } = await supabase
                .from("blocked_users")
                .select("id")
                .eq("blocker_id", userId)
                .eq("blocked_id", otherUserId)
                .maybeSingle();

              setIsBlocked(!!blockedByMe);

              const { data: blockedByOther } = await supabase
                .from("blocked_users")
                .select("id")
                .eq("blocker_id", otherUserId)
                .eq("blocked_id", userId)
                .maybeSingle();

              setIsBlockedByOther(!!blockedByOther);
            }
          }
        },
      )
      .subscribe();
  }, [userId, chatId, isGroup]);

  const cleanupBlockSubscription = useCallback(() => {
    if (blockChannelRef.current) {
      supabase.removeChannel(blockChannelRef.current);
      blockChannelRef.current = null;
    }
  }, []);

  return {
    isBlocked,
    setIsBlocked,
    isBlockedByOther,
    setIsBlockedByOther,
    checkBlockStatus,
    subscribeToBlockStatus,
    cleanupBlockSubscription,
  };
}
