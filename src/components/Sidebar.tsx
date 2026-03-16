import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { ChatHistory } from '../store/appStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onHome: () => void;
  chatHistory: ChatHistory[];
  onSelectChat: (chatId: string) => void;
  currentChatId?: string;
}

export const Sidebar: React.FC<Props> = ({
  visible,
  onClose,
  onHome,
  chatHistory,
  onSelectChat,
  currentChatId,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.5)" barStyle="light-content" />
      <View style={styles.overlay}>
        <View style={styles.sidebar}>
          {/* Branding */}
          <View style={styles.branding}>
            <Text style={styles.logo}>GPTee</Text>
            <Text style={styles.tagline}>GPT for Everyone, Free</Text>
          </View>

          {/* Home Button */}
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => {
              onHome();
              onClose();
            }}
          >
            <Icon name="home" size={20} color={colors.text.primary} />
            <Text style={styles.homeButtonText}>Home</Text>
          </TouchableOpacity>

          {/* Chat History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Chat History</Text>
            <ScrollView style={styles.historyList}>
              {chatHistory.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="message-square" size={32} color={colors.text.disabled} />
                  <Text style={styles.emptyText}>No chat history yet</Text>
                </View>
              ) : (
                chatHistory.map((chat) => (
                  <TouchableOpacity
                    key={chat.id}
                    style={[
                      styles.chatItem,
                      chat.id === currentChatId && styles.chatItemActive,
                    ]}
                    onPress={() => {
                      onSelectChat(chat.id);
                      onClose();
                    }}
                  >
                    <View style={styles.chatItemContent}>
                      <Icon name="message-circle" size={16} color={colors.text.tertiary} />
                      <Text
                        style={styles.chatItemText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {chat.name}
                      </Text>
                    </View>
                    <Text style={styles.chatItemDate}>
                      {new Date(chat.timestamp).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="x" size={24} color={colors.text.primary} />
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayTouchable: {
    flex: 1,
  },
  sidebar: {
    width: 280,
    backgroundColor: colors.background.primary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: 50,
    paddingBottom: 20,
  },
  branding: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.accent.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  historySection: {
    flex: 1,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  historyList: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.disabled,
    marginTop: 12,
  },
  chatItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatItemActive: {
    backgroundColor: colors.background.card,
    borderRightWidth: 3,
    borderRightColor: colors.accent.primary,
  },
  chatItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  chatItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    flex: 1,
  },
  chatItemDate: {
    fontSize: 11,
    color: colors.text.disabled,
    marginLeft: 26,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
