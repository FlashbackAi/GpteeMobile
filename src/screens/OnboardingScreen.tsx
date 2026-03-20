import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';
import { generateGameName } from '../utils/nameGenerator';
import { UserProfile } from '../store/appStore';

interface Props {
  onComplete: (profile: UserProfile) => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [generatedName, setGeneratedName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<UserProfile['gender']>('prefer-not-to-say');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [ageAgreementChecked, setAgeAgreementChecked] = useState(false);

  useEffect(() => {
    // Generate initial name
    setGeneratedName(generateGameName());
  }, []);

  const regenerateName = () => {
    setGeneratedName(generateGameName());
  };

  const useName = () => {
    setDisplayName(generatedName);
  };

  const handleContinue = () => {
    if (!displayName || !ageAgreementChecked) {
      return; // Name and age agreement are required
    }

    // Format date (YYYY-MM-DD), use placeholders if not provided
    const dob = year && month && day
      ? `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      : '2000-01-01'; // Default placeholder

    const profile: UserProfile = {
      displayName,
      gender,
      dateOfBirth: dob,
    };

    onComplete(profile);
  };

  const isValidDate = () => {
    if (!day || !month || !year) return true; // Optional
    const d = parseInt(day);
    const m = parseInt(month);
    const y = parseInt(year);
    return d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2025;
  };

  const canContinue = displayName.trim().length > 0 && (day === '' || isValidDate()) && ageAgreementChecked;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>gptee.org</Text>
            <Text style={styles.tagline}>let's get you set up</Text>
          </View>

          {/* Name Generation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>choose your display name</Text>
            <Text style={styles.sectionSubtitle}>
              this is how others will see you in the network
            </Text>

            <View style={styles.generatorCard}>
              <Text style={styles.generatedName}>{generatedName}</Text>
              <View style={styles.generatorButtons}>
                <TouchableOpacity style={styles.regenerateButton} onPress={regenerateName}>
                  <Text style={styles.regenerateButtonText}>🎲 generate new</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.useButton} onPress={useName}>
                  <Text style={styles.useButtonText}>use this</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.orText}>or enter your own:</Text>

            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="enter display name"
              placeholderTextColor={colors.input.placeholder}
              maxLength={20}
            />
          </View>

          {/* Gender */}
          {/* <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gender (Optional)</Text>
            <Text style={styles.sectionSubtitle}>
              Helps personalize your AI experience
            </Text>

            <View style={styles.genderOptions}>
              {(['male', 'female', 'other', 'prefer-not-to-say'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderOption, gender === g && styles.genderOptionSelected]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderOptionText, gender === g && styles.genderOptionTextSelected]}>
                    {g === 'prefer-not-to-say' ? 'Prefer not to say' : g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View> */}

          {/* Date of Birth */}
          {/* <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date of Birth (Optional)</Text>
            <Text style={styles.sectionSubtitle}>
              For age-appropriate and personalized responses
            </Text>

            <View style={styles.dateRow}>
              <TextInput
                style={[styles.dateInput, styles.dayInput]}
                value={day}
                onChangeText={setDay}
                placeholder="DD"
                placeholderTextColor={colors.input.placeholder}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.dateSeparator}>/</Text>
              <TextInput
                style={[styles.dateInput, styles.monthInput]}
                value={month}
                onChangeText={setMonth}
                placeholder="MM"
                placeholderTextColor={colors.input.placeholder}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.dateSeparator}>/</Text>
              <TextInput
                style={[styles.dateInput, styles.yearInput]}
                value={year}
                onChangeText={setYear}
                placeholder="YYYY"
                placeholderTextColor={colors.input.placeholder}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            {!isValidDate() && (
              <Text style={styles.errorText}>please enter a valid date</Text>
            )}
          </View> */}

          {/* Privacy Note */}
          {/* <View style={styles.privacyNote}>
            <Text style={styles.privacyText}>
              🔒 All data stays on your device. Nothing is sent to external servers.
            </Text>
          </View> */}

          {/* Age Agreement Checkbox */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAgeAgreementChecked(!ageAgreementChecked)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, ageAgreementChecked && styles.checkboxChecked]}>
              {ageAgreementChecked && (
                <Icon name="check" size={16} color={colors.button.primaryText} />
              )}
            </View>
            <Text style={styles.checkboxText}>
              i confirm that i am 18 years or older and agree to use this application
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueButtonText}>continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  logo: {
    fontSize: 48,
    color: colors.accent.primary,
    letterSpacing: -1,
    fontFamily: fonts.bold,
  },
  tagline: {
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 8,
    fontFamily: fonts.regular,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.text.primary,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  generatorCard: {
    backgroundColor: colors.terminal.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    marginBottom: 12,
  },
  generatedName: {
    fontSize: 24,
    color: colors.accent.primary,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  generatorButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  regenerateButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  regenerateButtonText: {
    fontSize: 14,
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  useButton: {
    flex: 1,
    backgroundColor: colors.button.primary,
    paddingVertical: 12,
    borderRadius: 8,
  },
  useButtonText: {
    fontSize: 14,
    color: colors.button.primaryText,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  orText: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: fonts.regular,
  },
  input: {
    backgroundColor: colors.input.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    fontFamily: fonts.regular,
  },
  genderOptions: {
    gap: 8,
  },
  genderOption: {
    backgroundColor: colors.background.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  genderOptionSelected: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  genderOptionText: {
    fontSize: 15,
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  genderOptionTextSelected: {
    color: colors.button.primaryText,
    fontFamily: fonts.regular,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    backgroundColor: colors.input.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.input.border,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  dayInput: {
    flex: 1,
  },
  monthInput: {
    flex: 1,
  },
  yearInput: {
    flex: 1.5,
  },
  dateSeparator: {
    fontSize: 18,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  errorText: {
    fontSize: 12,
    color: colors.status.error,
    marginTop: 8,
    fontFamily: fonts.regular,
  },
  privacyNote: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  privacyText: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
    backgroundColor: colors.terminal.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.button.primary,
    borderColor: colors.button.primary,
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  footer: {
    padding: 24,
    paddingTop: 16,
  },
  continueButton: {
    backgroundColor: colors.button.primary,
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonDisabled: {
    backgroundColor: colors.button.disabled,
  },
  continueButtonText: {
    fontSize: 16,
    color: colors.button.primaryText,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
});
