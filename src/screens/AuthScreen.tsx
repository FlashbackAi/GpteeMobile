/**
 * Auth Screen
 *
 * Two-step Solana wallet authentication flow:
 * Step 1: Connect wallet and check if user exists
 * Step 2a: Existing user → Direct login
 * Step 2b: New user → Choose name → Create account
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {colors, fonts} from '../theme/colors';
import {checkUserExists, loginExistingUser, createNewUser} from '../services/AuthService';
import {useAppStore} from '../store/appStore';

interface Props {
  onAuthSuccess: () => void;
}

type AuthStep = 'initial' | 'existing-user' | 'new-user';

export default function AuthScreen({onAuthSuccess}: Props) {
  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [isLoading, setIsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');
  const [existingUserName, setExistingUserName] = useState<string>('');
  const [generatedName, setGeneratedName] = useState('');
  const handleAuthSuccess = useAppStore(state => state.handleAuthSuccess);

  const generateNewName = () => {
    const {generateGameName} = require('../utils/nameGenerator');
    const newName = generateGameName();
    setGeneratedName(newName);
  };

  // Step 1: Connect wallet and check if user exists
  const handleConnectWallet = async () => {
    setIsLoading(true);
    try {
      console.log('[AuthScreen] Step 1: Connecting wallet...');

      const result = await checkUserExists();

      if (!result.success) {
        throw new Error(result.error || 'Failed to check user');
      }

      setWalletAddress(result.walletAddress!);
      setAuthToken(result.authToken!);

      if (result.exists) {
        // Existing user found
        console.log('[AuthScreen] Existing user detected');
        setExistingUserName(result.displayName || 'User');
        setAuthStep('existing-user');
      } else {
        // New user - generate name for them
        console.log('[AuthScreen] New user detected');
        generateNewName();
        setAuthStep('new-user');
      }
    } catch (error: any) {
      console.error('[AuthScreen] Step 1 failed:', error);
      Alert.alert(
        'Connection Failed',
        error?.message || 'Failed to connect wallet. Please try again.',
        [{text: 'OK'}]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2a: Login existing user
  const handleLoginExistingUser = async () => {
    setIsLoading(true);
    try {
      console.log('[AuthScreen] Step 2a: Logging in existing user...');

      const result = await loginExistingUser(walletAddress, authToken);

      if (!result.success || !result.walletAddress || !result.nodeId) {
        throw new Error(result.error || 'Login failed');
      }

      // Use the name we already got from Step 1 (check-node)
      // This handles cases where verify-node doesn't return the name
      const finalDisplayName = result.displayName || existingUserName;

      // Update app state
      await handleAuthSuccess(result.walletAddress, result.nodeId, result.peerId, finalDisplayName);

      // Success
      onAuthSuccess();
    } catch (error: any) {
      console.error('[AuthScreen] Step 2a failed:', error);
      Alert.alert(
        'Login Failed',
        error?.message || 'Failed to login. Please try again.',
        [
          {text: 'Retry', onPress: handleLoginExistingUser},
          {text: 'Cancel', onPress: () => setAuthStep('initial')},
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2b: Create new user account
  const handleCreateNewUser = async () => {
    if (!generatedName) {
      Alert.alert('Error', 'Please generate a node name first.');
      return;
    }

    setIsLoading(true);
    try {
      console.log('[AuthScreen] Step 2b: Creating new user...');

      const result = await createNewUser(walletAddress, authToken, generatedName);

      if (!result.success || !result.walletAddress || !result.nodeId) {
        throw new Error(result.error || 'Account creation failed');
      }

      // Use the name we sent to backend (generatedName)
      // Backend should echo it back, but use our local copy as fallback
      const finalDisplayName = result.displayName || generatedName;

      // Update app state
      await handleAuthSuccess(result.walletAddress, result.nodeId, result.peerId, finalDisplayName);

      // Success
      onAuthSuccess();
    } catch (error: any) {
      console.error('[AuthScreen] Step 2b failed:', error);
      Alert.alert(
        'Account Creation Failed',
        error?.message || 'Failed to create account. Please try again.',
        [
          {text: 'Retry', onPress: handleCreateNewUser},
          {text: 'Cancel', onPress: () => setAuthStep('initial')},
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>gptee.org</Text>
          <Text style={styles.tagline}>gpt for everyone, free.</Text>
        </View>

        {/* Step 1: Initial - Connect Wallet */}
        {authStep === 'initial' && (
          <>
            <Text style={styles.description}>
              Connect your wallet to join the P2P AI inference network. Your
              wallet serves as your identity across sessions.
            </Text>

            {/* Info Cards */}
            <View style={styles.infoCards}>
              <View style={styles.infoCard}>
                <Icon name="lock" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Secure authentication via wallet signature</Text>
              </View>

              <View style={styles.infoCard}>
                <Icon name="users" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Join a decentralized AI network</Text>
              </View>

              <View style={styles.infoCard}>
                <Icon name="zap" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Free AI inference & earn by providing</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
              onPress={handleConnectWallet}
              disabled={isLoading}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.background.primary} size="small" />
                  <Text style={styles.loadingText}>Connecting...</Text>
                </View>
              ) : (
                <>
                  <Icon name="log-in" size={20} color={colors.background.primary} />
                  <Text style={styles.connectButtonText}>Connect Wallet</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.helpText}>
              Don't have a wallet? Install Phantom or Solflare from your app store.
            </Text>
          </>
        )}

        {/* Step 2a: Existing User - Welcome Back */}
        {authStep === 'existing-user' && (
          <>
            <View style={styles.welcomeContainer}>
              <Icon name="check-circle" size={64} color={colors.accent.primary} />
              <Text style={styles.welcomeTitle}>Welcome back!</Text>
              <Text style={styles.welcomeName}>{existingUserName}</Text>
              <Text style={styles.welcomeAddress}>
                {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 6)}
              </Text>
            </View>

            <View style={styles.infoCards}>
              <View style={styles.infoCard}>
                <Icon name="user-check" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Existing account detected</Text>
              </View>

              <View style={styles.infoCard}>
                <Icon name="database" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Your data and settings will be restored</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
              onPress={handleLoginExistingUser}
              disabled={isLoading}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.background.primary} size="small" />
                  <Text style={styles.loadingText}>Signing in...</Text>
                </View>
              ) : (
                <>
                  <Icon name="arrow-right" size={20} color={colors.background.primary} />
                  <Text style={styles.connectButtonText}>Continue</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setAuthStep('initial')} style={styles.backButton}>
              <Text style={styles.backButtonText}>Use different wallet</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Step 2b: New User - Choose Name */}
        {authStep === 'new-user' && (
          <>
            <Text style={styles.description}>
              You're new! Choose a name for your node identity.
            </Text>

            <View style={styles.nameContainer}>
              <Text style={styles.nameLabel}>Your Node Name</Text>
              <View style={styles.nameDisplay}>
                <Text style={styles.nameText}>{generatedName || '...'}</Text>
                <TouchableOpacity
                  style={styles.generateButton}
                  onPress={generateNewName}
                  disabled={isLoading}>
                  <Icon name="refresh-cw" size={18} color={colors.accent.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.nameHint}>
                This will be your identity across the network. You can regenerate if you don't like it.
              </Text>
            </View>

            <View style={styles.infoCards}>
              <View style={styles.infoCard}>
                <Icon name="user-plus" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Creating new account</Text>
              </View>

              <View style={styles.infoCard}>
                <Icon name="shield" size={24} color={colors.accent.primary} />
                <Text style={styles.infoText}>Secured by your wallet signature</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
              onPress={handleCreateNewUser}
              disabled={isLoading}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.background.primary} size="small" />
                  <Text style={styles.loadingText}>Creating account...</Text>
                </View>
              ) : (
                <>
                  <Icon name="check-circle" size={20} color={colors.background.primary} />
                  <Text style={styles.connectButtonText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setAuthStep('initial')} style={styles.backButton}>
              <Text style={styles.backButtonText}>Use different wallet</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 48,
    fontFamily: fonts.bold,
    color: colors.accent.primary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  nameContainer: {
    marginBottom: 32,
  },
  nameLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text.primary,
    marginBottom: 8,
  },
  nameDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameText: {
    flex: 1,
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.accent.primary,
  },
  generateButton: {
    padding: 8,
  },
  nameHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
    marginTop: 6,
  },
  infoCards: {
    marginBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text.primary,
    marginLeft: 12,
    flex: 1,
  },
  connectButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.background.primary,
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.background.primary,
    marginLeft: 12,
  },
  helpText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  welcomeContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.accent.primary,
    marginBottom: 8,
  },
  welcomeAddress: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
});
