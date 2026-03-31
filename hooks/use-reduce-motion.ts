import { useSystemAccessibility } from './use-system-accessibility';

interface MotionConfig {
  reduceMotion: boolean;
  animationDuration: (normalMs: number) => number;
  transitionType: 'slide_from_right' | 'fade';
  modalAnimation: 'slide' | 'fade';
}

export function useReduceMotion(): MotionConfig {
  const { isReduceMotionEnabled } = useSystemAccessibility();

  return {
    reduceMotion: isReduceMotionEnabled,
    animationDuration: (normalMs: number) => (isReduceMotionEnabled ? 0 : normalMs),
    transitionType: isReduceMotionEnabled ? 'fade' : 'slide_from_right',
    modalAnimation: isReduceMotionEnabled ? 'fade' : 'slide',
  };
}
