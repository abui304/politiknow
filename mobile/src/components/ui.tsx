import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, type Ref, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { hasKeyboard } from '@/lib/device';
import { useWide } from '@/lib/layout';
import { useToasts } from '@/lib/toast';
import { APP_MAX_WIDTH, PAGE_MAX_WIDTH, colors, figures, float, fonts, motion, outline, radius, space, spring, type } from '@/theme';

import { GlossaryScope } from './GlossaryScope';

export type IconName = ComponentProps<typeof Feather>['name'];

/** Line icons (Feather), the only icon set in the app. Default 18; 16 inside dense rows. */
export function Icon({ name, size = 18, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

/** Touch targets smaller than 44pt get this much extra tappable area around them. */
export const HIT_SLOP = 8;

const isWeb = Platform.OS === 'web';
/** Web: a hovered control changes surface over `motion.fast` instead of snapping. */
const hoverEase = isWeb
  ? ({ transitionProperty: 'background-color, border-color', transitionDuration: `${motion.fast}ms` } as object)
  : null;
/** ⌘ on Macs, Ctrl elsewhere, for keyboard shortcut hints on web. */
export const MOD_KEY = isWeb && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// ---------- layout ----------

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  width = 'page',
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  /** On desktop: 'page' is a reading column, 'wide' leaves room for a second column beside it. */
  width?: 'page' | 'wide';
}) {
  const desktop = useWide();
  const maxWidth = desktop ? (width === 'wide' ? 1120 : PAGE_MAX_WIDTH) : APP_MAX_WIDTH;
  const inner = (
    <View style={[styles.column, { maxWidth }, padded && { paddingHorizontal: desktop ? space.xl : space.lg }]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <GlossaryScope>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </GlossaryScope>
    </SafeAreaView>
  );
}

export function TopBar({ title, right, back = true }: { title?: string; right?: ReactNode; back?: boolean }) {
  return (
    <View style={styles.topBar}>
      {back ? (
        <IconButton
          icon="arrow-left"
          label="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Txt style={[type.h3, { flex: 1, textAlign: 'center' }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Txt>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** A 40px round icon-only control, e.g. back or share in the top bar. `label` is read aloud and shown as a tooltip on web. */
export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconBtn, hoverEase]}
      hoverStyle={styles.hoverWell}
      {...(isWeb ? ({ title: label } as object) : null)}>
      <Icon name={icon} size={20} />
    </Tap>
  );
}

export function Txt({ style, ...props }: TextProps) {
  return <Text {...props} style={[type.body, style]} />;
}

/**
 * A headline whose lines are balanced: a two-line title breaks near the middle instead of leaving one word
 * on the last line. Android and web balance natively; iOS gets its "push-out" strategy, which avoids orphans.
 */
export function Title({ style, ...props }: TextProps) {
  return (
    <Text
      accessibilityRole="header"
      textBreakStrategy="balanced"
      lineBreakStrategyIOS="push-out"
      {...props}
      style={[type.title, isWeb && ({ textWrap: 'balance' } as object), style]}
    />
  );
}

/**
 * A section of a page: content on the paper, set off by a hairline rule below, the way a printed record
 * separates its parts. Not a floating box: the app keeps boxes for things you type into or press.
 */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * A number that rolls to its new value: the old one slides out and the new one in, upward when it went up
 * and downward when it went down, so a vote visibly lands. It only rolls when `live` is set (the person just
 * acted on it); numbers appearing on screen or refreshing from the server change in place, without motion.
 * Instant under Reduce Motion.
 */
export function CountRoll({ value, style, live = false }: { value: number; style?: TextProps['style']; live?: boolean }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<1 | -1>(1);
  const [rolled, setRolled] = useState(false);
  const reduce = useReducedMotion();
  if (value !== prev) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
    setRolled(live);
  }
  const animate = rolled && !reduce;
  const enter = dir === 1 ? FadeInDown : FadeInUp;
  const exit = dir === 1 ? FadeOutUp : FadeOutDown;
  return (
    <View style={{ overflow: 'hidden' }} accessibilityLiveRegion="polite">
      <Animated.Text
        key={value}
        entering={animate ? enter.duration(motion.base) : undefined}
        exiting={animate ? exit.duration(motion.fast) : undefined}
        style={style}>
        {value}
      </Animated.Text>
    </View>
  );
}

/** A small key, for keyboard shortcut hints. Only shown where there's a keyboard to press (not on touch screens). */
export function Keycap({ children, onDark }: { children: string; onDark?: boolean }) {
  if (!hasKeyboard) return null;
  return (
    <View style={[styles.keycap, onDark && styles.keycapDark]}>
      <Text style={[styles.keycapText, onDark && { color: 'rgba(255,255,255,0.85)' }]}>{children}</Text>
    </View>
  );
}

// ---------- interactive ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that dips slightly while held and gives a light haptic tick on phones. The dip runs on the UI
 * thread and is interruptible: releasing mid-press reverses from wherever it is, it never finishes first.
 * Small targets get HIT_SLOP of extra tappable area by default.
 */
export function Tap({ style, hoverStyle, onPressIn, onPressOut, onPress, onHoverIn, onHoverOut, hitSlop = HIT_SLOP, ...props }: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Web: applied while the pointer is over the control. Keep it to a surface step from the theme. */
  hoverStyle?: StyleProp<ViewStyle>;
}) {
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const reduce = useReducedMotion();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  return (
    <AnimatedPressable
      {...props}
      hitSlop={hitSlop}
      style={[style, hovered && !props.disabled && hoverStyle, animated]}
      onHoverIn={(e) => {
        if (hoverStyle) setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        onHoverOut?.(e);
      }}
      onPressIn={(e) => {
        if (!reduce)
          scale.set(
            withTiming(0.98, {
              duration: motion.fast,
              easing: Easing.out(Easing.cubic),
            }),
          );
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, spring));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (!isWeb) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
    />
  );
}

type ButtonProps = {
  /** Say what the button does: a verb and its object, like "Post comment", not "Submit". */
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Overrides the primary fill, for semantic actions like approve. Text stays white. */
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  size?: 'small' | 'regular' | 'large';
  /** Shorthand for size="small". */
  small?: boolean;
  /** Read aloud after the label, to say what happens next, e.g. "Opens Congress.gov in your browser". */
  hint?: string;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', color, loading, disabled, icon, size, small, hint, style }: ButtonProps) {
  const s = size ?? (small ? 'small' : 'regular');
  const inactive = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  // A disabled button is a quiet well from the paper ramp with muted text, not a faded copy of the live one.
  const off = Boolean(disabled) && !loading;
  const bg = off && filled
    ? colors.surfaceAlt
    : (color ??
      {
        primary: colors.ink,
        secondary: colors.surface,
        ghost: 'transparent',
        danger: colors.danger,
      }[variant]);
  const fg = off ? colors.muted : filled ? '#fff' : colors.ink;
  const hover = color
    ? undefined
    : {
        primary: colors.inkHover,
        secondary: colors.surfaceAlt,
        ghost: colors.surfaceAlt,
        danger: colors.dangerHover,
      }[variant];
  return (
    <Tap
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{
        disabled: Boolean(inactive),
        busy: Boolean(loading),
      }}
      style={[
        styles.button,
        s === 'small' && styles.buttonSmall,
        s === 'large' && styles.buttonLarge,
        { backgroundColor: bg },
        variant === 'secondary' && styles.buttonSecondary,
        hoverEase,
        style,
      ]}
      hoverStyle={hover ? { backgroundColor: hover } : undefined}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={s === 'small' ? 16 : s === 'large' ? 20 : 18} color={fg} /> : null}
          <Text
            style={[
              styles.buttonText,
              s === 'small' && { fontSize: 14, lineHeight: 20 },
              s === 'large' && { fontSize: 17, lineHeight: 24 },
              { color: fg },
            ]}>
            {title}
          </Text>
        </View>
      )}
    </Tap>
  );
}

/** A topic, status or filter. Selected chips fill with ink, or with `color` when it carries meaning (a party tint). */
export function Chip({
  label,
  selected,
  onPress,
  color,
  small,
  accessibilityLabel,
  leading,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  small?: boolean;
  accessibilityLabel?: string;
  /** Drawn before the label, e.g. a topic's icon. Gets the chip's text color. */
  leading?: (color: string) => ReactNode;
}) {
  const filled = selected ? (color ?? colors.ink) : undefined;
  const textColor = selected && !color ? '#fff' : colors.inkSoft;
  const content = (
    <>
    {leading ? leading(textColor) : null}
    <Text
      style={[
        styles.chipText,
        small && styles.chipTextSmall,
        selected && {
          color: color ? colors.ink : '#fff',
          fontFamily: fonts.medium,
        },
      ]}
      numberOfLines={1}>
      {label}
    </Text>
    </>
  );
  const chipStyle = [styles.chip, small && styles.chipSmall, filled && { backgroundColor: filled, borderColor: filled }];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={[chipStyle, hoverEase]}
      hoverStyle={selected ? undefined : styles.hoverWell}>
      {content}
    </Tap>
  );
}

/** A bill or district number (H.R. 1234, WA-8), set like a docket stamp. Tappable when it links somewhere. */
export function DocketTag({
  label,
  onPress,
  tint,
  muted,
  external,
}: {
  label: string;
  onPress?: () => void;
  tint?: string;
  muted?: boolean;
  /** Opens an outside page (Congress.gov) rather than a screen in the app; shows a small arrow. */
  external?: boolean;
}) {
  const body = (
    <>
      <Text style={[type.docket, styles.docketText, muted && { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      {external ? <Icon name="external-link" size={11} color={colors.inkSoft} /> : null}
    </>
  );
  const style = [
    styles.docket,
    external && styles.docketRow,
    tint ? { backgroundColor: tint, borderColor: tint } : null,
    muted && styles.docketMuted,
  ];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={external ? `Open ${label} on Congress.gov` : `Open ${label}`}
      style={style}>
      {body}
    </Tap>
  );
}

/**
 * Tabs, set as words with an ink rule under the chosen one. The rule slides to the tab you pick (a spring, so
 * a quick second tap redirects it mid-way), which says "this view changed" without a jump.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: { key: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (key: K) => void;
  small?: boolean;
}) {
  const [frames, setFrames] = useState<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const reduce = useReducedMotion();
  const frame = frames[value];
  useEffect(() => {
    if (!frame) return;
    const first = w.get() === 0;
    x.set(reduce || first ? frame.x : withSpring(frame.x, spring));
    w.set(reduce || first ? frame.w : withSpring(frame.w, spring));
  }, [frame, reduce, x, w]);
  // The marker is a 1px bar stretched with scaleX, so the slide is a transform (cheap on every device).
  const marker = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() + w.get() / 2 - 0.5 }, { scaleX: Math.max(w.get(), 0.001) }],
  }));
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Tap
            key={o.key}
            onPress={() => onChange(o.key)}
            onLayout={(e) => {
              const { x: fx, width } = e.nativeEvent.layout;
              setFrames((f) => (f[o.key]?.x === fx && f[o.key]?.w === width ? f : { ...f, [o.key]: { x: fx, w: width } }));
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={0}
            style={[styles.tab, small && styles.tabSmall]}>
            {o.icon ? <Icon name={o.icon} size={16} color={on ? colors.ink : colors.muted} /> : null}
            <Text style={[styles.tabText, small && { fontSize: 14 }, on && styles.tabTextOn]}>{o.label}</Text>
          </Tap>
        );
      })}
      <Animated.View pointerEvents="none" style={[styles.tabMarker, marker]} />
    </View>
  );
}

export function Field({ label, error, ref, ...props }: TextInputProps & { label?: string; error?: string; ref?: Ref<TextInput> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      {label ? <Txt style={[type.small, { color: colors.ink }]}>{label}</Txt> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label ?? props.placeholder}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, props.style]}
      />
      {error ? <Txt style={[type.small, { color: colors.danger }]}>{error}</Txt> : null}
    </View>
  );
}

// ---------- loading ----------

/** A gray block standing in for content that's loading. Pulses gently unless Reduce Motion is on. */
export function Skeleton({ width = '100%', height = 16, r = radius.xs, style }: {
  width?: number | `${number}%`;
  height?: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduce) opacity.set(withRepeat(withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [reduce, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceAlt }, animated, style]} />;
}

/** The shape of a bill card while the feed or search loads. */
export function BillCardSkeleton() {
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden', marginBottom: space.lg }]} accessibilityLabel="Loading bill">
      <View style={{ height: 44, backgroundColor: colors.surfaceAlt }} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="92%" height={20} />
        <Skeleton width="70%" height={20} />
        <Skeleton height={36} style={{ marginTop: space.md }} />
        <Skeleton width="96%" height={14} style={{ marginTop: space.md }} />
        <Skeleton width="88%" height={14} />
        <Skeleton width="60%" height={14} />
      </View>
      <View style={{ height: 44, backgroundColor: colors.surfaceAlt }} />
    </View>
  );
}

/** The shape of a list row (an alert, a comment, a legislator) while it loads. */
export function RowSkeleton({ avatar = true }: { avatar?: boolean }) {
  return (
    <View
      style={[
        styles.card,
        {
          flexDirection: 'row',
          gap: space.md,
          padding: space.md,
          marginBottom: space.sm,
        },
      ]}>
      {avatar ? <Skeleton width={36} height={36} r={radius.sm} /> : null}
      <View style={{ flex: 1, gap: space.sm }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="30%" height={10} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 3, kind = 'bill' }: { count?: number; kind?: 'bill' | 'row' }) {
  return (
    <View accessible accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (kind === 'bill' ? <BillCardSkeleton key={i} /> : <RowSkeleton key={i} />))}
    </View>
  );
}

// ---------- feedback ----------

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.inkSoft} size="large" />
      <Txt style={[type.small, { marginTop: space.sm }]}>{label}</Txt>
    </View>
  );
}

/** An empty or error state. Always offers a next step: `action` is required. */
export function Empty({
  icon,
  art,
  title,
  body,
  action,
}: {
  icon?: IconName;
  /** A drawn picture in place of the icon, e.g. the steaming cup for a quiet week. */
  art?: ReactNode;
  title: string;
  body?: string;
  action: ReactNode;
}) {
  return (
    <View style={[styles.center, { paddingVertical: 48, gap: space.sm }]}>
      <View style={styles.emptyIcon}>{art ?? (icon ? <Icon name={icon} size={24} color={colors.inkSoft} /> : null)}</View>
      <Txt style={[type.h3, { textAlign: 'center' }]}>{title}</Txt>
      {body ? <Txt style={[type.small, { textAlign: 'center', maxWidth: 320 }]}>{body}</Txt> : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

const TOAST_ICON = {
  info: 'info',
  success: 'check-circle',
  error: 'alert-circle',
} as const;
const TOAST_COLOR = {
  info: colors.inkSoft,
  success: colors.success,
  error: colors.danger,
};

/** Toasts sit at the bottom, near the thumb and the button that caused them, above the tab bar and the
 *  home indicator. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.toastWrap, { bottom: insets.bottom + 72 }]}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeInDown.springify().damping(spring.damping).stiffness(spring.stiffness)}
          exiting={FadeOutDown.duration(motion.fast)}
          style={[styles.toast, float()]}
          accessibilityLiveRegion="polite"
          accessibilityRole={t.tone === 'error' ? 'alert' : undefined}>
          <Icon name={TOAST_ICON[t.tone]} size={16} color={TOAST_COLOR[t.tone]} />
          <Txt style={[type.bodyMedium, { flexShrink: 1 }]}>{t.message}</Txt>
          {t.action ? (
            <Tap onPress={t.action.onPress} accessibilityRole="button" style={styles.toastAction}>
              <Text style={styles.toastActionText}>{t.action.label}</Text>
            </Tap>
          ) : null}
        </Animated.View>
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
        <Tap
          key={o.label}
          style={styles.sheetRow}
          hitSlop={0}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            o.onPress();
          }}>
          <Txt style={[type.body, o.danger && { color: colors.danger }]}>{o.label}</Txt>
        </Tap>
      ))}
      <Button title="Cancel" variant="secondary" onPress={onClose} style={{ marginTop: space.md }} />
    </BottomSheet>
  );
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * A panel that slides up over the bottom of the screen. Drag it down (or tap outside, or press Escape on
 * web) to close it. The drag follows the finger, can be reversed mid-way, and a quick flick closes it.
 */
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
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true); // mount as soon as it's asked for; unmount after sliding out
  const y = useSharedValue(800);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (visible) {
      y.set(reduce ? 0 : withSpring(0, spring));
    } else {
      y.set(
        withTiming(800, { duration: reduce ? 0 : motion.enter }, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, reduce, y]);

  useEffect(() => {
    if (!isWeb || !visible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onChange((e) => {
      y.set(Math.max(0, y.get() + e.changeY)); // follows the finger, no rubber band above the top
    })
    .onEnd((e) => {
      if (y.get() > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        y.set(withSpring(800, { ...spring, velocity: e.velocityY }));
        scheduleOnRN(onClose);
      } else {
        y.set(withSpring(0, { ...spring, velocity: e.velocityY }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - y.get() / 500),
  }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <View style={styles.sheetHost} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
                maxHeight: '85%',
              },
              sheetStyle,
            ]}
            accessibilityViewIsModal>
            <GestureDetector gesture={pan}>
              <View style={styles.sheetHandleArea}>
                <View style={styles.grabber} />
                <Txt style={type.h3} accessibilityRole="header">
                  {title}
                </Txt>
              </View>
            </GestureDetector>
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------- identity ----------

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Default generated identicon (spec 6.2): a symmetric 5x5 pattern from the user's name, printed in ink. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hash(name);
  const cell = size / 7;
  const cells: ViewStyle[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if ((h >> (row * 3 + col + 3)) & 1) {
        for (const c of col === 2 ? [2] : [col, 4 - col]) {
          cells.push({ position: 'absolute', left: cell * (c + 1), top: cell * (row + 1), width: cell, height: cell, backgroundColor: colors.inkSoft });
        }
      }
    }
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: colors.surfaceAlt,
          overflow: 'hidden',
        },
        outline(size / 2.6),
      ]}
      accessibilityLabel={`${name}'s avatar`}>
      {cells.map((s, i) => (
        <View key={i} style={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    height: 44,
  },
  tabSmall: { height: 36 },
  tabText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  tabTextOn: { fontFamily: fonts.medium, color: colors.ink },
  tabMarker: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    width: 1,
    height: 2,
    backgroundColor: colors.ink,
  },
  screen: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoverWell: { backgroundColor: colors.surfaceAlt },
  card: { backgroundColor: colors.surface, padding: space.lg, ...outline(radius.lg) },
  keycap: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keycapDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  keycapText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
    ...figures,
  },
  button: {
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  buttonSmall: { height: 36, paddingHorizontal: space.lg },
  buttonLarge: {
    height: 56,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  buttonSecondary: { borderWidth: 1, borderColor: colors.lineStrong },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginBottom: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  chipSmall: { paddingVertical: space.xs, paddingHorizontal: 10 },
  chipTextSmall: { fontSize: 12, lineHeight: 16 },
  docket: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.xs,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  docketRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  docketMuted: { backgroundColor: 'transparent', borderColor: colors.line },
  docketText: { fontSize: 12, lineHeight: 16 },
  input: {
    backgroundColor: colors.surface,
    minHeight: 48, // the same height as the button beside or below it
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  // Focus is shown by the field's own border; the browser's ring would be drawn inside the rounded box.
  inputFocused: {
    borderColor: colors.ink,
    ...(isWeb ? ({ outlineStyle: 'none' } as object) : null),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.sm,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    maxWidth: APP_MAX_WIDTH - 32,
    backgroundColor: colors.surface,
    ...outline(radius.md),
  },
  toastAction: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginLeft: space.xs,
  },
  toastActionText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  backdrop: { backgroundColor: 'rgba(43,38,34,0.32)' },
  sheetHost: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.bg,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    paddingHorizontal: space.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderCurve: 'continuous',
  },
  sheetHandleArea: { paddingTop: space.md, paddingBottom: space.md },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: space.lg,
  },
  sheetRow: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
