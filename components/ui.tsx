import React from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ViewStyle, TextStyle, TextInput,
} from 'react-native';
import { color, type, space, radius } from '@/lib/theme';

/** Text props shared by every typographic helper. Press support matters:
 *  several inline affordances ("Change", "← Back") are text, not buttons. */
interface TextProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  onPress?: () => void;
  testID?: string;
  numberOfLines?: number;
}

const make = (base: TextStyle) =>
  function Txt({ children, style, onPress, testID, numberOfLines }: TextProps) {
    return (
      <Text
        testID={testID}
        onPress={onPress}
        numberOfLines={numberOfLines}
        accessibilityRole={onPress ? 'button' : undefined}
        style={[base, style]}
      >
        {children}
      </Text>
    );
  };

export const Display = make(type.display as TextStyle);
export const H1 = make(type.h1 as TextStyle);
export const H2 = make(type.h2 as TextStyle);
export const H3 = make(type.h3 as TextStyle);
export const Body = make(type.body as TextStyle);
export const Small = make(type.small as TextStyle);
export const Tiny = make(type.xs as TextStyle);

export const Eyebrow = ({ children, tone, style }: {
  children: React.ReactNode; tone?: string; style?: TextStyle;
}) => (
  <Text style={[type.eyebrow, tone ? { color: tone } : null, { marginBottom: space.sm }, style]}>
    {children}
  </Text>
);

export const Rule = ({ style }: { style?: ViewStyle }) => (
  <View style={[{ height: 1, backgroundColor: color.line, marginVertical: space.lg }, style]} />
);

export function Card({
  children, tone, onPress, style, testID,
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'ink' | 'wash' | 'sage' | 'gold' | 'blush' | 'blue' | 'blueSolid';
  onPress?: () => void; style?: ViewStyle; testID?: string;
}) {
  const tones: Record<string, ViewStyle> = {
    plain: { backgroundColor: color.card, borderColor: color.line },
    ink: { backgroundColor: color.ink, borderColor: color.ink },
    wash: { backgroundColor: color.wash, borderColor: 'transparent' },
    sage: { backgroundColor: color.sageWash, borderColor: 'transparent' },
    gold: { backgroundColor: color.goldWash, borderColor: 'transparent' },
    blush: { backgroundColor: color.blushWash, borderColor: 'transparent' },
    blue: { backgroundColor: color.blueWash, borderColor: 'transparent' },
    // Inverted. theme.ts assigns meanings to sage/gold/blush but not blue, so
    // blue is the accent free to mean "media" without breaking that scheme.
    // Text on this tone must set its own colour — see (member)/home.tsx.
    blueSolid: { backgroundColor: color.blue, borderColor: color.blue },
  };
  const inner = (
    <View style={[s.card, tones[tone ?? 'plain'], style]}>{children}</View>
  );
  return onPress
    ? <Pressable testID={testID} onPress={onPress} accessibilityRole="button">{inner}</Pressable>
    : <View testID={testID}>{inner}</View>;
}

export function Button({
  label, onPress, variant = 'solid', disabled, testID,
}: {
  label: string; onPress?: () => void;
  variant?: 'solid' | 'outline' | 'quiet'; disabled?: boolean; testID?: string;
}) {
  const v: Record<string, { box: ViewStyle; text: TextStyle }> = {
    solid: { box: { backgroundColor: color.ink }, text: { color: color.white } },
    outline: { box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.ink }, text: { color: color.ink } },
    quiet: { box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.line }, text: { color: color.muted } },
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      // `disabled` and accessibilityState, not just a dropped handler and 40%
      // opacity. Without them the control is inert but still announced as an
      // enabled button, still focusable, and still reports itself as enabled
      // to anything asking — a sighted user sees "off", a screen reader user
      // is told "on". This applies to every Button in the app; it surfaced on
      // the one that deletes your account.
      disabled={disabled}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={[s.btn, v[variant].box, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.btnText, v[variant].text]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label, tone = 'plain',
}: { label: string; tone?: 'plain' | 'sage' | 'gold' | 'blue' | 'muted' | 'ink' }) {
  const t: Record<string, { box: ViewStyle; text: TextStyle }> = {
    plain: { box: { borderColor: color.line, backgroundColor: color.white }, text: { color: color.muted } },
    sage: { box: { borderColor: color.sage, backgroundColor: color.sage }, text: { color: color.white } },
    gold: { box: { borderColor: color.gold, backgroundColor: color.goldWash }, text: { color: '#8A6D28' } },
    blue: { box: { borderColor: color.blue, backgroundColor: 'transparent' }, text: { color: color.blue } },
    muted: { box: { borderColor: 'transparent', backgroundColor: color.wash }, text: { color: color.muted } },
    ink: { box: { borderColor: color.ink, backgroundColor: color.ink }, text: { color: color.white } },
  };
  return (
    <View style={[s.pill, t[tone].box]}>
      <Text style={[s.pillText, t[tone].text]}>{label}</Text>
    </View>
  );
}

export function Field({
  label, value, onChangeText, placeholder, multiline, hint, testID, editable = true,
  secure, autoCapitalize, keyboardType,
}: {
  label?: string; value: string; onChangeText?: (v: string) => void;
  placeholder?: string; multiline?: boolean; hint?: string; testID?: string; editable?: boolean;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={[type.eyebrow, { marginBottom: 6 }]}>{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.faint}
        editable={editable}
        multiline={multiline}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={[s.input, multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      {hint ? <Tiny style={{ marginTop: 6 }}>{hint}</Tiny> : null}
    </View>
  );
}

export function Screen({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={[
        { paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
        pad && { paddingHorizontal: space.xl, paddingTop: space.lg },
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function Avatar({ label, size = 50 }: { label: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontFamily: type.h3.fontFamily, fontSize: size / 2.8, color: color.inkSoft }}>
        {label}
      </Text>
    </View>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md }, style]}>{children}</View>
);

export const Wrap = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
);

const s = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md,
  },
  btn: {
    paddingVertical: 15, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center',
  },
  btnText: {
    fontFamily: type.small.fontFamily, fontSize: 13, fontWeight: '500',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  pill: {
    borderWidth: 1, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: type.small.fontFamily, fontSize: 10, letterSpacing: 1.2,
    textTransform: 'uppercase', fontWeight: '500',
  },
  input: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    backgroundColor: color.white, color: color.ink,
    fontFamily: type.body.fontFamily,
  },
  avatar: {
    backgroundColor: color.wash, borderWidth: 1, borderColor: color.line,
    alignItems: 'center', justifyContent: 'center',
  },
});
