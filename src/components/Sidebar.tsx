import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { ChatHistory, useAppStore } from '../store/appStore';

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
  const { toggleStarChat, renameChat, deleteChat } = useAppStore();
  const [menuOpenChatId, setMenuOpenChatId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const handleStarToggle = async (chatId: string, e: any) => {
    e.stopPropagation();
    await toggleStarChat(chatId);
  };

  const handleMenuToggle = (chatId: string, e: any) => {
    e.stopPropagation();
    setMenuOpenChatId(menuOpenChatId === chatId ? null : chatId);
  };

  const handleRenameClick = (chat: ChatHistory, e: any) => {
    e.stopPropagation();
    setSelectedChatId(chat.id);
    setRenameValue(chat.name);
    setRenameDialogOpen(true);
    setMenuOpenChatId(null);
  };

  const handleDeleteClick = (chatId: string, e: any) => {
    e.stopPropagation();
    setSelectedChatId(chatId);
    setDeleteDialogOpen(true);
    setMenuOpenChatId(null);
  };

  const handleRenameConfirm = async () => {
    if (renameValue.trim()) {
      await renameChat(selectedChatId, renameValue.trim());
      setRenameDialogOpen(false);
      setRenameValue('');
    }
  };

  const handleDeleteConfirm = async () => {
    await deleteChat(selectedChatId);
    setDeleteDialogOpen(false);
  };
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
            <View style={styles.brandingHeader}>
              <Text style={styles.logo}>gptee.org</Text>
              <TouchableOpacity
                style={styles.homeIconButton}
                onPress={() => {
                  onHome();
                  onClose();
                }}
              >
                <Icon name="home" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.tagline}>GPT for Everyone, Free.</Text>
          </View>

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
                  <View key={chat.id} style={styles.chatItemWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.chatItem,
                        chat.id === currentChatId && styles.chatItemActive,
                      ]}
                      onPress={() => {
                        onSelectChat(chat.id);
                        onClose();
                      }}
                    >
                      <View style={styles.chatItemMain}>
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
                          {formatDate(chat.timestamp)}
                        </Text>
                      </View>
                      <View style={styles.chatItemActions}>
                        <TouchableOpacity
                          onPress={(e) => handleStarToggle(chat.id, e)}
                          style={styles.actionButton}
                        >
                          <Icon
                            name={chat.starred ? "star" : "star"}
                            size={16}
                            color={chat.starred ? colors.accent.primary : colors.text.tertiary}
                            fill={chat.starred ? colors.accent.primary : 'none'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={(e) => handleMenuToggle(chat.id, e)}
                          style={styles.actionButton}
                        >
                          <Icon name="more-vertical" size={16} color={colors.text.tertiary} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                    {menuOpenChatId === chat.id && (
                      <View style={styles.contextMenu}>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={(e) => handleRenameClick(chat, e)}
                        >
                          <Icon name="edit-2" size={14} color={colors.text.primary} />
                          <Text style={styles.menuItemText}>Rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={(e) => handleDeleteClick(chat.id, e)}
                        >
                          <Icon name="trash-2" size={14} color={colors.status.error} />
                          <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
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

      {/* Rename Dialog */}
      {renameDialogOpen && (
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Rename Chat</Text>
            <TextInput
              style={styles.dialogInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Enter new name"
              placeholderTextColor={colors.text.tertiary}
              autoFocus
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonSecondary]}
                onPress={() => {
                  setRenameDialogOpen(false);
                  setRenameValue('');
                }}
              >
                <Text style={styles.dialogButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonPrimary]}
                onPress={handleRenameConfirm}
              >
                <Text style={styles.dialogButtonTextPrimary}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Delete Chat</Text>
            <Text style={styles.dialogMessage}>
              Are you sure you want to delete this chat? This action cannot be undone.
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonSecondary]}
                onPress={() => setDeleteDialogOpen(false)}
              >
                <Text style={styles.dialogButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonDanger]}
                onPress={handleDeleteConfirm}
              >
                <Text style={styles.dialogButtonTextPrimary}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  brandingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent.primary,
    letterSpacing: -0.5,
  },
  homeIconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background.card,
  },
  tagline: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
    letterSpacing: 0.5,
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
  chatItemWrapper: {
    position: 'relative',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  chatItemMain: {
    flex: 1,
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
  chatItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  contextMenu: {
    position: 'absolute',
    right: 20,
    top: 45,
    backgroundColor: colors.background.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 140,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  menuItemTextDanger: {
    color: colors.status.error,
  },
  dialogOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  dialog: {
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  dialogMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  dialogInput: {
    backgroundColor: colors.input.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  dialogButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  dialogButtonSecondary: {
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dialogButtonPrimary: {
    backgroundColor: colors.button.primary,
  },
  dialogButtonDanger: {
    backgroundColor: colors.status.error,
  },
  dialogButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dialogButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.button.primaryText,
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
