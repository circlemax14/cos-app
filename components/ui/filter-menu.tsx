import React from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, TextStyle, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { IconSymbol } from '@/components/ui/icon-symbol';

type IconName = React.ComponentProps<typeof IconSymbol>['name'];

export interface FilterMenuOption {
  id: string;
  label: string;
}

interface FilterMenuProps {
  options: FilterMenuOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  color: string;
  menuBackgroundColor?: string;
  menuTextColor?: string;
  menuHighlightColor?: string;
  fontSize?: number;
  fontWeight?: string | number;
  iconName?: IconName;
  iconSize?: number;
  accessibilityLabel?: string;
}

export function FilterMenu({
  options,
  selectedId,
  onSelect,
  onClear,
  color,
  menuBackgroundColor,
  menuTextColor,
  menuHighlightColor,
  fontSize = 14,
  fontWeight = '500',
  iconName = 'slider.vertical.3',
  iconSize = 22,
  accessibilityLabel = 'Filter options',
}: FilterMenuProps) {
  const anchorRef = React.useRef<View>(null);
  const [visible, setVisible] = React.useState(false);
  const [anchorLayout, setAnchorLayout] = React.useState<{ x: number; y: number; height: number } | null>(null);

  React.useEffect(() => {
    return () => {
      setVisible(false);
    };
  }, []);

  const openMenu = () => {
    if (!anchorRef.current) {
      setVisible(true);
      return;
    }
    anchorRef.current.measureInWindow((x, y, width, height) => {
      setAnchorLayout({ x, y, height });
      setVisible(true);
    });
  };

  const highlightColor = menuHighlightColor || (color + '1A');
  const textColor = menuTextColor || color;

  return (
    <View>
      <TouchableOpacity
        ref={anchorRef}
        onPress={openMenu}
        accessibilityLabel={accessibilityLabel}
        style={styles.touchTarget}
      >
        <IconSymbol name={iconName} size={iconSize} color={color} />
      </TouchableOpacity>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable
            style={[
              styles.menuContainer,
              getMenuPosition(anchorLayout),
              {
                backgroundColor: menuBackgroundColor || '#fff',
                borderColor: (menuTextColor || color) + '30',
              },
            ]}
            onPress={() => undefined}
          >
            {options.map(option => {
              const isSelected = option.id === selectedId;
              return (
              <Pressable
                key={option.id}
                style={[
                  styles.menuItem,
                  isSelected ? { backgroundColor: highlightColor } : null,
                ]}
                onPress={() => {
                  onSelect(option.id);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    { color: textColor, fontSize, fontWeight: fontWeight as TextStyle['fontWeight'] },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
              );
            })}
            <Pressable
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => {
                onClear();
                setVisible(false);
              }}
            >
              <Text style={[styles.menuItemText, { color: textColor, fontSize, fontWeight: fontWeight as TextStyle['fontWeight'] }]}>
                Clear filter
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const MENU_WIDTH = 220;

const getMenuPosition = (anchor: { x: number; y: number; height: number } | null) => {
  const { width } = Dimensions.get('window');
  const top = (anchor?.y ?? 0) + (anchor?.height ?? 0) + 8;
  const left = Math.min(
    Math.max(8, (anchor?.x ?? width - MENU_WIDTH - 8)),
    width - MENU_WIDTH - 8
  );
  return { top, left };
};

const styles = StyleSheet.create({
  touchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
  },
  menuContainer: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemLast: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000020',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
