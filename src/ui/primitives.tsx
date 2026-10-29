import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {s} from './styles';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
};

export function Button({label, onPress, disabled, variant = 'primary', compact}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [s.button, compact && s.compactButton, s[`${variant}Button`], disabled && s.disabled, pressed && s.pressed]}>
      <Text style={[s.buttonText, variant === 'primary' ? s.primaryButtonText : variant === 'danger' ? s.dangerText : s.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}


export function SectionLabel({children}: {children: string}) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

export function StatusRow({label, detail, active}: {label: string; detail: string; active: boolean}) {
  return <View style={s.statusRow}>
    <View style={[s.statusDot, active && s.activeDot]} />
    <View style={s.flex}><Text style={s.rowTitle}>{label}</Text><Text style={s.smallText}>{detail}</Text></View>
    <Text style={[s.statusValue, active && s.activeText]}>{active ? 'ON' : 'OFF'}</Text>
  </View>;
}

