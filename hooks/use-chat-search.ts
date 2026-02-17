import { Message, Profile } from "@/types/database";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { Animated, Platform, TextInput } from "react-native";

interface MessageWithSender extends Message {
  sender: Profile | null;
  replied_message?: {
    id: string;
    content: string | null;
    sender: Profile | null;
    media_type: "image" | "video" | "audio" | "location" | "file" | null;
  } | null;
}

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

/**
 * Хук для поиска по сообщениям в чате.
 * Принимает внешние highlight-состояния, так как они используются и для пиннеда.
 */
export function useChatSearch(
  messages: MessageWithSender[],
  scrollToMessageId: (messageId: string, animated?: boolean) => void,
  highlightAnimation: Animated.Value,
  setHighlightedMessageId: (id: string | null) => void,
) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageWithSender[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchAnimation = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    Animated.timing(searchAnimation, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  }, [searchAnimation]);

  const closeSearch = useCallback(() => {
    Animated.timing(searchAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
      setCurrentSearchIndex(0);
      setHighlightedMessageId(null);
    });
  }, [searchAnimation]);

  const scrollToSearchResult = useCallback(
    (index: number, results?: MessageWithSender[]) => {
      const searchList = results || searchResults;
      if (searchList.length === 0 || index < 0 || index >= searchList.length)
        return;

      const targetMessage = searchList[index];
      const msgIndex = messages.findIndex((m) => m.id === targetMessage.id);

      if (msgIndex !== -1) {
        setHighlightedMessageId(targetMessage.id);
        scrollToMessageId(targetMessage.id, true);

        // Анимация подсветки
        highlightAnimation.setValue(0);
        Animated.sequence([
          Animated.timing(highlightAnimation, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(highlightAnimation, {
            toValue: 0.3,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(highlightAnimation, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.delay(500),
          Animated.timing(highlightAnimation, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setHighlightedMessageId(null);
        });

        safeHaptic(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [searchResults, messages, scrollToMessageId, highlightAnimation],
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (query.trim().length < 2) {
        setSearchResults([]);
        setCurrentSearchIndex(0);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const results = messages.filter(
        (m) => m.content && m.content.toLowerCase().includes(lowerQuery),
      );

      setSearchResults(results);
      setCurrentSearchIndex(results.length > 0 ? 0 : -1);

      if (results.length > 0) {
        scrollToSearchResult(0, results);
      }
    },
    [messages, scrollToSearchResult],
  );

  const navigateSearchResult = useCallback(
    (direction: "next" | "prev") => {
      if (searchResults.length === 0) return;

      let newIndex: number;
      if (direction === "next") {
        newIndex = (currentSearchIndex + 1) % searchResults.length;
      } else {
        newIndex =
          (currentSearchIndex - 1 + searchResults.length) %
          searchResults.length;
      }

      setCurrentSearchIndex(newIndex);
      scrollToSearchResult(newIndex);
    },
    [searchResults, currentSearchIndex, scrollToSearchResult],
  );

  return {
    showSearch,
    searchQuery,
    searchResults,
    currentSearchIndex,
    searchAnimation,
    searchInputRef,
    openSearch,
    closeSearch,
    handleSearch,
    navigateSearchResult,
    scrollToSearchResult,
  };
}
