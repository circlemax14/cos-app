import { useEffect, useState } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';

interface SystemAccessibility {
  systemFontScale: number;
  isReduceMotionEnabled: boolean;
  isBoldTextEnabled: boolean;
  isHighContrastEnabled: boolean;
  isScreenReaderEnabled: boolean;
}

export function useSystemAccessibility(): SystemAccessibility {
  const { fontScale } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [boldText, setBoldText] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    AccessibilityInfo.isBoldTextEnabled().then(setBoldText);
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);

    const reduceMotionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const boldTextSub = AccessibilityInfo.addEventListener('boldTextChanged', setBoldText);
    const screenReaderSub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);

    return () => {
      reduceMotionSub.remove();
      boldTextSub.remove();
      screenReaderSub.remove();
    };
  }, []);

  return {
    systemFontScale: fontScale,
    isReduceMotionEnabled: reduceMotion,
    isBoldTextEnabled: boldText,
    isHighContrastEnabled: highContrast,
    isScreenReaderEnabled: screenReader,
  };
}
