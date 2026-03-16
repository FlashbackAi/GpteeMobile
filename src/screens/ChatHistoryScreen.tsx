import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { ChatMessage } from '../network/PeerProtocol';

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface Props {
  onBack: () => void;
  onSelectChat: (session: ChatSession) => void;
  currentMessages: ChatMessage[];
}

const CHAT_HISTORY_KEY = '@gptee_chat_history';

export default function ChatHistoryScreen({ onBack, onSelectChat, currentMessages }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[];
        setSessions(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentChat = async () => {
    if (currentMessages.length === 0) {
      Alert.alert('Empty Chat', 'No messages to save');
      return;
    }

    const firstUserMessage = currentMessages.find(m => m.role === 'user');
    const title = firstUserMessage
      ? firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
      : 'New Chat';

    const newSession: ChatSession = {
      id: Date.now().toString(),
      title,
      messages: currentMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const updated = [newSession, ...sessions];
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(updated));
      setSessions(updated);
      Alert.alert('Saved', 'Chat saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save chat');
      console.error('Failed to save chat:', error);
    }
  };

  const deleteChat = async (id: string) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = sessions.filter(s => s.id !== id);
              await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(updated));
              setSessions(updated);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete chat');
              console.error('Failed to delete chat:', error);
            }
          },
        },
      ]
    );
  };

  const clearAllChats = () => {
    Alert.alert(
      'Clear All Chats',
      'Are you sure you want to delete all chat history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
              setSessions([]);
            } catch (error) {
              Alert.alert('Error', 'Failed to clear chats');
              console.error('Failed to clear chats:', error);
            }
          },
        },
      ]
    );
  };

  const renderSession = ({ item }: { item: ChatSession }) => (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={() => {
        onSelectChat(item);
        onBack();
      }}
    >
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <TouchableOpacity
          onPress={() => deleteChat(item.id)}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sessionMeta}>
        {item.messages.length} messages • {new Date(item.updatedAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat History</Text>
        <TouchableOpacity onPress={saveCurrentChat} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      {sessions.length > 0 && (
        <View style={styles.actionsBar}>
          <Text style={styles.countText}>{sessions.length} saved chat{sessions.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={clearAllChats}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No saved chats yet</Text>
          <Text style={styles.emptySubtext}>
            Tap "Save" to save your current chat
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.text.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.button.primary,
    borderRadius: 6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.button.primaryText,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background.secondary,
  },
  countText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  clearAllText: {
    fontSize: 13,
    color: colors.status.error,
    fontWeight: '500',
  },
  list: {
    padding: 16,
  },
  sessionCard: {
    backgroundColor: colors.background.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
    marginRight: 8,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 24,
    color: colors.text.tertiary,
    lineHeight: 24,
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
});
