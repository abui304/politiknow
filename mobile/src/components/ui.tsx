import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToasts } from '@/lib/toast';
import { APP_MAX_WIDTH, colors, fonts, radius, space, sticker, type } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

/** Line icons (Feather). Used instead of emoji so the UI looks the same on every platform. */
export function Icon({ name, size = 18, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

// ---------- layout ----------

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const inner = <View style={[styles.column, padded && { paddingHorizontal: space.lg }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function TopBar({ title, right, back = true }: { title?: string; right?: ReactNode; back?: boolean }) {
  return (
    <View style={styles.topBar}>
      {back ? (
        <BouncyPressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[styles.iconBtn, sticker(2, radius.pill)]}
          accessibilityLabel="Go back">
          <Icon name="arrow-left" size={20} />
        </BouncyPressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Txt style={[type.h3, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>
        {title}
      </Txt>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Txt({ style, ...props }: TextProps) {
  return <Text {...props} style={[type.body, style]} />;
}

export function Card({ children, style, offset = 3 }: { children: ReactNode; style?: StyleProp<ViewStyle>; offset?: number }) {
  return <View style={[styles.card, sticker(offset), style]}>{children}</View>;
}

// ---------- interactive ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that squishes on press and does a tiny haptic tap on phones. */
export function BouncyPressable({ style, onPressIn, onPressOut, onPress, ...props }: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 12 }).start();
  return (
    <AnimatedPressable
      {...props}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        to(0.94);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
    />
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', color, loading, disabled, icon, small, style }: ButtonProps) {
  const bg =
    color ??
    { primary: colors.blue, secondary: colors.surface, ghost: 'transparent', danger: colors.red }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.ink : '#fff';
  const inactive = disabled || loading;
  return (
    <BouncyPressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: inactive ? 0.55 : 1 },
        variant !== 'ghost' && sticker(small ? 2 : 3, radius.pill),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={small ? 15 : 18} color={fg} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </View>
      )}
    </BouncyPressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.yellow,
  small,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  small?: boolean;
}) {
  const content = (
    <Text style={[styles.chipText, small && styles.chipTextSmall, selected && { fontFamily: fonts.extrabold }]} numberOfLines={1}>
      {label}
    </Text>
  );
  const chipStyle = [styles.chip, small && styles.chipSmall, selected && [{ backgroundColor: color }, sticker(2, radius.pill)]];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <BouncyPressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={chipStyle}>
      {content}
    </BouncyPressable>
  );
}

/** Pill-shaped tabs, e.g. Top / New. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  color = colors.ink,
  small,
}: {
  options: { key: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (key: K) => void;
  color?: string;
  small?: boolean;
}) {
  return (
    <View style={[styles.segment, sticker(2, radius.pill)]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <BouncyPressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segmentBtn, small && { paddingVertical: 5 }, on && { backgroundColor: color }]}>
            {o.icon ? <Icon name={o.icon} size={14} color={on ? '#fff' : colors.ink} /> : null}
            <Text style={[styles.segmentText, small && { fontSize: 13 }, on && { color: '#fff' }]}>{o.label}</Text>
          </BouncyPressable>
        );
      })}
    </View>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt style={type.small}>{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, sticker(2, radius.md) as TextStyle, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]}
      />
      {error ? <Txt style={[type.small, { color: colors.danger }]}>{error}</Txt> : null}
    </View>
  );
}

// ---------- feedback ----------

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Txt style={[type.small, { marginTop: space.sm }]}>{label}</Txt>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={[styles.center, { paddingVertical: 48, gap: space.sm }]}>
      <View style={[styles.emptyIcon, sticker(3, radius.pill)]}>
        <Icon name={icon} size={30} />
      </View>
      <Txt style={[type.h2, { textAlign: 'center' }]}>{title}</Txt>
      {body ? <Txt style={[type.body, { color: colors.inkSoft, textAlign: 'center', maxWidth: 320 }]}>{body}</Txt> : null}
      {action}
    </View>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      {toasts.map((t) => (
        <View
          key={t.id}
          style={[
            styles.toast,
            sticker(3, radius.pill),
            { backgroundColor: t.tone === 'error' ? '#FFE3E3' : t.tone === 'success' ? '#DDF8EC' : colors.surface },
          ]}>
          <Txt style={type.bodyBold}>{t.message}</Txt>
        </View>
      ))}
    </View>
  );
}

/** Bottom sheet with a list of choices. Works on iOS, Android and web. */
export function Sheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; danger?: boolean; onPress: () => void }[];
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
          {options.map((o) => (
            <BouncyPressable
              key={o.label}
              style={styles.sheetRow}
              onPress={() => {
                onClose();
                o.onPress();
              }}>
              <Txt style={[type.bodyBold, o.danger && { color: colors.danger }]}>{o.label}</Txt>
            </BouncyPressable>
          ))}
          <Button title="Never mind" variant="secondary" onPress={onClose} style={{ marginTop: space.sm }} />
    </BottomSheet>
  );
}

/** A panel that slides over the bottom of the screen; tapping outside closes it. Scrolls when tall. */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrolling content, e.g. action buttons. */
  footer?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, sticker(4), { maxHeight: '85%' }]} onPress={() => {}}>
          <Txt style={[type.h3, { marginBottom: space.sm }]}>{title}</Txt>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- identity ----------

const AVATAR_COLORS = [colors.blue, colors.red, colors.yellow, colors.mint, colors.lilac, colors.pink];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Default generated identicon (spec 6.2): a symmetric 5x5 pixel pattern from the user's name. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hash(name);
  const fg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const cell = size / 7;
  const cells: ViewStyle[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if ((h >> (row * 3 + col + 3)) & 1) {
        for (const c of col === 2 ? [2] : [col, 4 - col]) {
          cells.push({ position: 'absolute', left: cell * (c + 1), top: cell * (row + 1), width: cell, height: cell, backgroundColor: fg });
        }
      }
    }
  }
  return (
    <View
      style={[{ width: size, height: size, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }, sticker(2, size / 2.6)]}
      accessibilityLabel={`${name}'s avatar`}>
      {cells.map((s, i) => (
        <View key={i} style={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 3 },
  segmentBtn: { flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  segmentText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  screen: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.sm },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  card: { backgroundColor: colors.surface, padding: space.lg },
  button: {
    paddingVertical: 14,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.lg, minHeight: 36 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontFamily: fonts.extrabold, fontSize: 16 },
  emptyIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, marginBottom: space.sm },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.hairline,
    maxWidth: '100%',
  },
  chipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  chipSmall: { paddingVertical: 4, paddingHorizontal: 9 },
  chipTextSmall: { fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  toastWrap: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', gap: space.sm, zIndex: 1000 },
  toast: { paddingVertical: 10, paddingHorizontal: space.lg, maxWidth: APP_MAX_WIDTH - 32 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,35,64,0.35)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.bg,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    padding: space.xl,
    paddingBottom: 36,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sheetRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
});
