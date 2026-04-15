import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export default function ProviderSelectionScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const handleEPICSignIn = () => {
    // TODO: Implement EPIC authentication
    router.replace('/Home');
  };

  const handle1UpSignIn = () => {
    // TODO: Implement 1Up authentication
    router.replace('/Home');
  };

  return (
    <AppWrapper showBellIcon={false} showLogo={false} showHamburgerIcon={false}>
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContainer, 
          { 
            backgroundColor: colors.background,
            paddingBottom: Math.max(40, insets.bottom + 40),
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { padding: getScaledFontSize(24), gap: getScaledFontSize(24) }]}>
          <Image 
            source={require('@/assets/images/logo.png')} 
            style={[{ width: getScaledFontSize(220), height: getScaledFontSize(140) }]}
            contentFit="contain"
          />
          
          <View style={styles.content}>
            <Text 
              variant="headlineSmall" 
              style={[
                styles.title, 
                { 
                  color: colors.text, 
                  fontSize: getScaledFontSize(24), 
                  fontWeight: getScaledFontWeight(600) as any,
                  lineHeight: getScaledFontSize(24) * 1.5,
                  marginBottom: getScaledFontSize(8),
                }
              ]}
            >
              Choose Your Provider
            </Text>
            
            <Text 
              style={[
                styles.subtitle, 
                { 
                  color: colors.text, 
                  fontSize: getScaledFontSize(16), 
                  fontWeight: getScaledFontWeight(400) as any,
                  lineHeight: getScaledFontSize(16) * 1.5,
                  marginBottom: getScaledFontSize(24),
                }
              ]}
            >
              Sign in with your healthcare provider to continue
            </Text>

            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                buttonColor="#0066CC" // EPIC's typical blue color
                onPress={handleEPICSignIn}
                style={[styles.providerButton, { marginBottom: getScaledFontSize(16) }]}
                contentStyle={[
                  styles.buttonContent,
                  { 
                    minHeight: Math.max(56, getScaledFontSize(20) + getScaledFontSize(16) * 2),
                    paddingHorizontal: getScaledFontSize(24),
                    paddingVertical: getScaledFontSize(16),
                  }
                ]}
                labelStyle={[
                  styles.buttonLabel, 
                  { 
                    fontSize: getScaledFontSize(16), 
                    fontWeight: getScaledFontWeight(600) as any,
                    lineHeight: getScaledFontSize(20),
                    paddingVertical: getScaledFontSize(4),
                  }
                ]}
              >
                Sign in with EPIC
              </Button>

              {/* <Button
                mode="contained"
                buttonColor="#008080" // Using app's tint color for 1Up (teal)
                onPress={handle1UpSignIn}
                style={styles.providerButton}
                contentStyle={[
                  styles.buttonContent,
                  { 
                    height: Math.max(56, getScaledFontSize(16) * 1.5 + getScaledFontSize(16) * 2),
                    paddingHorizontal: getScaledFontSize(24),
                    paddingVertical: getScaledFontSize(12),
                  }
                ]}
                labelStyle={[
                  styles.buttonLabel, 
                  { 
                    fontSize: getScaledFontSize(16), 
                    fontWeight: getScaledFontWeight(600) as any,
                    lineHeight: getScaledFontSize(16) * 1.2,
                  }
                ]}
              >
                Sign in with 1Up
              </Button> */}
            </View>
          </View>
        </View>
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    paddingTop: 40,
    paddingBottom: 40,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  providerButton: {
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonLabel: {
    color: 'white',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

