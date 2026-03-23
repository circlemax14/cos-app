import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';

export interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  progress: number;
  /** Label for the progress bar */
  label?: string;
  /** Subtitle or additional info */
  subtitle?: string;
  /** Color of the progress bar */
  color?: string;
  /** Background color of the progress bar container */
  backgroundColor?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Height of the progress bar */
  height?: number;
}

export function ProgressBar({
  progress,
  label,
  subtitle,
  color,
  backgroundColor,
  showPercentage = true,
  height,
}: ProgressBarProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const isDark = settings.isDarkTheme;
  
  const defaultColor = color || '#0a7ea4';
  const defaultBgColor = backgroundColor || (isDark ? '#2a2a2a' : '#e8f4f8');
  const barHeight = height || getScaledFontSize(12);
  
  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <View style={styles.container}>
      {(label || subtitle) && (
        <View style={styles.header}>
          {label && (
            <Text
              style={[
                styles.label as TextStyle,
                {
                  color: isDark ? '#ECEDEE' : '#11181C',
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                },
              ]}
            >
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text
              style={[
                styles.percentage as TextStyle,
                {
                  color: isDark ? '#9BA1A6' : '#687076',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                },
              ]}
            >
              {Math.round(clampedProgress)}%
            </Text>
          )}
        </View>
      )}
      <View
        style={[
          styles.progressContainer as ViewStyle,
          {
            backgroundColor: defaultBgColor,
            height: barHeight,
            borderRadius: barHeight / 2,
          },
        ]}
      >
        <View
          style={[
            styles.progressBar as ViewStyle,
            {
              backgroundColor: defaultColor,
              width: `${clampedProgress}%`,
              height: barHeight,
              borderRadius: barHeight / 2,
            },
          ]}
        />
      </View>
      {subtitle && (
        <Text
          style={[
            styles.subtitle as TextStyle,
            {
              color: isDark ? '#9BA1A6' : '#687076',
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
              marginTop: getScaledFontSize(4),
            },
          ]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    flex: 1,
  },
  percentage: {
    marginLeft: 8,
  },
  progressContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {},
  subtitle: {
    marginTop: 4,
  },
});

