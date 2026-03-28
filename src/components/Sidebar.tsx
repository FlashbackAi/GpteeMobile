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
import { colors, fonts } from '../theme/colors';
import { ChatHistory, useAppStore } from '../store/appStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onHome: () => void;
  chatHistory: ChatHistory[];
  onSelectChat: (chatId: string) => void;
  currentChatId?: string;
  onNewChat?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  visible,
  onClose,
  onHome,
  chatHistory,
  onSelectChat,
  currentChatId,
  onNewChat,
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
              <View style={styles.brandingText}>
                <Text style={styles.logo}>gptee.org</Text>
                <Text style={styles.tagline}>gpt for everyone, free.</Text>
              </View>
              <TouchableOpacity
                style={styles.homeIconButton}
                onPress={() => {
                  onHome();
                  onClose();
                }}
              >
                <Icon name="home" size={22} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Chat History */}
          <View style={styles.historySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>chat history</Text>
              {onNewChat && (
                <TouchableOpacity
                  style={styles.newChatButton}
                  onPress={() => {
                    onNewChat();
                    onClose();
                  }}
                >
                  <Icon name="plus" size={14} color={colors.terminal.green} />
                  <Text style={styles.newChatButtonText}>new chat</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.historyList}>
              {chatHistory.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="message-square" size={32} color={colors.text.disabled} />
                  <Text style={styles.emptyText}>no chat history yet</Text>
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
                          <Text style={styles.menuItemText}>rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={(e) => handleDeleteClick(chat.id, e)}
                        >
                          <Icon name="trash-2" size={14} color={colors.status.error} />
                          <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>delete</Text>
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
            <Text style={styles.closeButtonText}>close</Text>
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
            <Text style={styles.dialogTitle}>rename chat</Text>
            <TextInput
              style={styles.dialogInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="enter new name"
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
                <Text style={styles.dialogButtonTextSecondary}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonPrimary]}
                onPress={handleRenameConfirm}
              >
                <Text style={styles.dialogButtonTextPrimary}>rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>delete chat</Text>
            <Text style={styles.dialogMessage}>
              are you sure you want to delete this chat? this action cannot be undone.
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonSecondary]}
                onPress={() => setDeleteDialogOpen(false)}
              >
                <Text style={styles.dialogButtonTextSecondary}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonDanger]}
                onPress={handleDeleteConfirm}
              >
                <Text style={styles.dialogButtonTextPrimary}>delete</Text>
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
    borderRightWidth: 2,
    borderRightColor: colors.terminal.greenDim,
    paddingTop: 50,
    paddingBottom: 20,
  },
  branding: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  brandingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  brandingText: {
    flex: 1,
    marginRight: 8,
  },
  logo: {
    fontSize: 28,
    // fontWeight: '800',
    color: colors.accent.primary,
    letterSpacing: -0.5,
    fontFamily: fonts.bold,
    marginBottom: 4,
  },
  homeIconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
    borderWidth: 1,
    borderColor: colors.terminal.green,
    flexShrink: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
    fontFamily: fonts.regular,
  },
  historySection: {
    flex: 1,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
    fontFamily: fonts.regular,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  newChatButtonText: {
    fontSize: 11,
    color: colors.terminal.green,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    borderBottomColor: colors.terminal.greenDim,
  },
  chatItemActive: {
    backgroundColor: colors.terminal.background,
    borderRightWidth: 3,
    borderRightColor: colors.accent.primary,
    borderLeftWidth: 2,
    borderLeftColor: colors.terminal.greenDim,
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
    color: colors.text.primary,
    flex: 1,
    fontFamily: fonts.regular,
  },
  chatItemDate: {
    fontSize: 11,
    color: colors.text.disabled,
    marginLeft: 26,
    fontFamily: fonts.regular,
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
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
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
    color: colors.text.primary,
    fontFamily: fonts.regular,
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
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
  },
  dialogTitle: {
    fontSize: 20,
    color: colors.text.primary,
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  dialogMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  dialogButtonTextPrimary: {
    fontSize: 14,
    color: colors.button.primaryText,
    fontFamily: fonts.regular,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
    marginTop: 16,
  },
  closeButtonText: {
    fontSize: 16,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
});
