/**
 * Avatar Utilities
 * 
 * Generates avatar components with initials when profile pictures are not available
 */

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Avatar } from 'react-native-paper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/** Image source type for React Native: either a local require() number or a URI object */
type ImageSource = number | { uri: string };

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  
  if (parts.length === 1) {
    // Single name - use first 2 letters
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  // Multiple names - use first letter of first and last name
  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return (first + last).toUpperCase();
}

/**
 * Generate a color based on name (deterministic)
 */
export function getAvatarColor(name: string): string {
  if (!name) return '#008080';
  
  // Generate a consistent color based on name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use teal color palette
  const colors = [
    '#008080', // Teal
    '#0a7ea4', // Blue-teal
    '#4ECDC4', // Light teal
    '#45B7D1', // Sky blue
    '#96CEB4', // Mint green
    '#5F9EA0', // Cadet blue
    '#20B2AA', // Light sea green
    '#48D1CC', // Medium turquoise
    '#00CED1', // Dark turquoise
    '#17A2B8', // Info blue
  ];
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

interface InitialsAvatarProps {
  name: string;
  size: number;
  style?: StyleProp<ViewStyle>;
  image?: ImageSource; // Optional fallback image
  backgroundColor?: string;
}

/**
 * Avatar component that shows initials when no image is available
 */
export function InitialsAvatar({ 
  name, 
  size, 
  style, 
  image, 
  backgroundColor 
}: InitialsAvatarProps) {
  const { settings } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  
  const initials = getInitials(name);
  const bgColor = backgroundColor || getAvatarColor(name);
  
  // Only use image if it's a URL string (from API), not the default dummy image
  // Since we don't have photos in Fasten Health data, always show initials
  const shouldUseImage = image && (typeof image === 'string' || (typeof image === 'object' && image.uri));
  
  if (shouldUseImage) {
    return (
      <Avatar.Image 
        source={image} 
        size={size} 
        style={style}
      />
    );
  }
  
  // Show initials with colored background
  console.log(`InitialsAvatar: Showing initials "${initials}" for "${name}" with color ${bgColor}`);
  
  // Merge styles - ensure backgroundColor is always our generated color
  // Remove backgroundColor from style prop if it exists, then apply our color last
  let cleanedStyle = style;
  if (style) {
    if (Array.isArray(style)) {
      cleanedStyle = style.map(s => {
        if (s && typeof s === 'object') {
          const { backgroundColor, ...rest } = s;
          return rest;
        }
        return s;
      });
    } else if (typeof style === 'object') {
      const { backgroundColor, ...rest } = style;
      cleanedStyle = rest;
    }
  }
  
  const mergedStyle = cleanedStyle ? [
    cleanedStyle,
    {
      backgroundColor: bgColor,
    },
  ] : {
    backgroundColor: bgColor,
  };
  
  return (
    <Avatar.Text
      size={size}
      label={initials}
      style={mergedStyle}
      labelStyle={{
        color: '#FFFFFF',
        fontSize: size * 0.4,
        fontWeight: '600',
      }}
    />
  );
}

/**
 * Get avatar source - returns image if available, otherwise null for initials
 */
export function getAvatarSource(image?: ImageSource): ImageSource | null {
  return image || null;
}

