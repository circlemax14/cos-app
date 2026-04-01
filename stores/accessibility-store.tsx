import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, useWindowDimensions } from 'react-native';

interface AccessibilitySettings {
  fontSizeScale: number;
  isBoldTextEnabled: boolean;
  isDarkTheme: boolean;
  isAccessibilityMode: boolean;
  isHighContrast: boolean;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateFontScale: (scale: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  toggleBoldText: () => void;
  toggleTheme: () => void;
  toggleAccessibilityMode: () => void;
  toggleHighContrast: () => void;
  isLoading: boolean;
  getScaledFontSize: (baseFontSize: number) => number;
  getScaledFontWeight: (baseFontWeight: number) => string;
  getThemeBaseColor: () => string;
  effectiveFontScale: number;
}

const defaultSettings: AccessibilitySettings = {
  fontSizeScale: 100,
  isBoldTextEnabled: false,
  isDarkTheme: false,
  isAccessibilityMode: false,
  isHighContrast: false,
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

const STORAGE_KEY = 'accessibility_settings';
const SMART_DEFAULTS_KEY = 'accessibility_smart_defaults_applied';

const isTablet = () => {
  const { width } = Dimensions.get('window');
  return width >= 768;
};

const getMaxFontSizeLimit = () => {
  return isTablet() ? 200 : 150;
};

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const { fontScale: systemFontScale } = useWindowDimensions();

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      saveSettings();
    }
  }, [settings, isLoading]);

  // Apply smart defaults on first launch
  useEffect(() => {
    if (!isLoading) {
      applySmartDefaults();
    }
  }, [isLoading]);

  const applySmartDefaults = async () => {
    const applied = await AsyncStorage.getItem(SMART_DEFAULTS_KEY);
    if (applied) return;

    let newSettings = { ...settings };
    let changed = false;

    // If system Dynamic Type > 135%, enable accessibility mode
    if (systemFontScale > 1.35) {
      newSettings.isAccessibilityMode = true;
      changed = true;
    }

    // Check system bold text
    const sysBold = await AccessibilityInfo.isBoldTextEnabled();
    if (sysBold && !newSettings.isBoldTextEnabled) {
      newSettings.isBoldTextEnabled = true;
      changed = true;
    }

    if (changed) {
      setSettings(newSettings);
    }

    await AsyncStorage.setItem(SMART_DEFAULTS_KEY, 'true');
  };

  const loadSettings = async () => {
    try {
      const storedSettings = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        const maxLimit = getMaxFontSizeLimit();
        const clampedFontSizeScale = Math.min(
          Math.max(parsedSettings.fontSizeScale || defaultSettings.fontSizeScale, 50),
          maxLimit
        );
        setSettings({
          ...defaultSettings,
          ...parsedSettings,
          fontSizeScale: clampedFontSizeScale,
        });
      }
    } catch (error) {
      console.error('Error loading accessibility settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving accessibility settings:', error);
    }
  };

  // Use the LARGER of system font scale or in-app scale
  const effectiveFontScale = Math.max(
    systemFontScale,
    settings.fontSizeScale / 100
  );

  const accessibilityMultiplier = settings.isAccessibilityMode ? 1.3 : 1;

  const getScaledFontSize = (baseFontSize: number) => {
    const scaled = Math.round(baseFontSize * effectiveFontScale * accessibilityMultiplier);
    // Cap at 2x to prevent layout breaking
    const maxScaled = baseFontSize * 2;
    return Math.min(scaled, maxScaled);
  };

  const getScaledFontWeight = (baseFontWeight: number) => {
    return settings.isBoldTextEnabled
      ? Math.min(baseFontWeight + 200, 900).toString()
      : baseFontWeight.toString();
  };

  const getThemeBaseColor = () => {
    return settings.isDarkTheme ? '#000000' : '#FFFFFF';
  };

  const updateFontScale = (scale: number) => {
    const maxLimit = getMaxFontSizeLimit();
    setSettings(prev => ({ ...prev, fontSizeScale: Math.max(50, Math.min(maxLimit, scale)) }));
  };

  const increaseFontSize = () => {
    const maxLimit = getMaxFontSizeLimit();
    setSettings(prev => ({
      ...prev,
      fontSizeScale: Math.min(prev.fontSizeScale + 10, maxLimit),
    }));
  };

  const decreaseFontSize = () => {
    setSettings(prev => ({
      ...prev,
      fontSizeScale: Math.max(prev.fontSizeScale - 10, 50),
    }));
  };

  const toggleBoldText = () => {
    setSettings(prev => ({ ...prev, isBoldTextEnabled: !prev.isBoldTextEnabled }));
  };

  const toggleTheme = () => {
    setSettings(prev => ({ ...prev, isDarkTheme: !prev.isDarkTheme }));
  };

  const toggleAccessibilityMode = () => {
    setSettings(prev => ({ ...prev, isAccessibilityMode: !prev.isAccessibilityMode }));
  };

  const toggleHighContrast = () => {
    setSettings(prev => ({ ...prev, isHighContrast: !prev.isHighContrast }));
  };

  const value: AccessibilityContextType = {
    settings,
    updateFontScale,
    increaseFontSize,
    decreaseFontSize,
    toggleBoldText,
    toggleTheme,
    toggleAccessibilityMode,
    toggleHighContrast,
    isLoading,
    getScaledFontSize,
    getScaledFontWeight,
    getThemeBaseColor,
    effectiveFontScale,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
