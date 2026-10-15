import { type ReactNode, type Ref, useImperativeHandle, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, radius, sticker } from '@/theme';

import { BouncyPressable, Icon } from './ui';

export type Box = [number, number, number, number]; // x0, y0, x1, y1

type Zoom = { cx: number; cy: number; k: number };

export type ZoomHandle = {
  /** Zooms to fit `box` (at least `minZoom`), e.g. a tapped state. */
  zoomTo: (box: Box, minZoom?: number) => void;
};

type Props = {
  /** The whole map, in SVG units. At zoom 1 it's fit to the screen. */
  base: Box;
  /** Region to show first, e.g. a selected district. */
  initial?: Box;
  maxZoom: number;
  ref?: Ref<ZoomHandle>;
  /** A tap (not a drag or pinch), at (x, y) in map units. `unit` is map units per screen pixel; `k` the zoom. */
  onTap?: (x: number, y: number, unit: number, k: number) => void;
  /** Renders the SVG for a view box. `px` is the on-screen width, so strokes and text can stay a constant size.
   *  Taps go to `onTap`, not to the shapes: on phones the gesture handler gets the touches first. */
  children: (view: Box, px: number, k: number) => ReactNode;
};

/** Grows `box` to the viewport's aspect ratio, keeping its center. */
function toAspect([x0, y0, x1, y1]: Box, aspect: number): Box {
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** Pinch to zoom and drag to pan an SVG map, with +/- and reset buttons (also how web zooms).
 *  During a gesture the rendered SVG is just transformed; when the gesture ends the zoom is committed to
 *  the view box, so the map redraws sharp, with lines and labels at their normal size. */
export function ZoomView({ base, initial, maxZoom, ref, onTap, children }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);

  // Live gesture transform, committed to `zoom` when the gesture ends.
  const s = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinch = useSharedValue(1);
  const fx = useSharedValue(0);
  const fy = useSharedValue(0);
  const active = useSharedValue(0);
  const scaleRange = useSharedValue<[number, number]>([1, maxZoom]);

  const aspect = size ? size.w / size.h : 1;
  const fitted = toAspect(base, aspect);
  const fw = fitted[2] - fitted[0];
  const fh = fitted[3] - fitted[1];

  const clamp = (z: Zoom): Zoom => {
    const k = Math.min(Math.max(z.k, 1), maxZoom);
    if (k === 1) return { k, cx: (fitted[0] + fitted[2]) / 2, cy: (fitted[1] + fitted[3]) / 2 };
    return { k, cx: Math.min(Math.max(z.cx, base[0]), base[2]), cy: Math.min(Math.max(z.cy, base[1]), base[3]) };
  };

  /** The zoom that fits `box` on screen. */
  const fit = (box: Box, minZoom = 1): Zoom => {
    const b = toAspect(box, aspect);
    return clamp({ k: Math.max(fw / (b[2] - b[0]), minZoom), cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 });
  };

  // Until the user zooms, show `initial` (or the whole map).
  const z = zoom ?? (initial ? fit(initial) : fit(fitted));
  useImperativeHandle(ref, () => ({ zoomTo: (box, minZoom) => setZoom(fit(box, minZoom)) }));
  const vw = fw / z.k;
  const vh = fh / z.k;
  const view: Box = [z.cx - vw / 2, z.cy - vh / 2, z.cx + vw / 2, z.cy + vh / 2];

  // A committed zoom has redrawn the SVG, so drop the temporary transform.
  useLayoutEffect(() => {
    s.set(1);
    tx.set(0);
    ty.set(0);
    scaleRange.set([1 / z.k, maxZoom / z.k]);
  }, [z.k, z.cx, z.cy, maxZoom, s, tx, ty, scaleRange]);

  const commit = (scale: number, dx: number, dy: number) => {
    if (!size) return;
    // The screen center now shows the content point that was at (-dx, -dy) / scale from the center.
    const unit = vw / size.w;
    setZoom(clamp({ k: z.k * scale, cx: z.cx - (dx / scale) * unit, cy: z.cy - (dy / scale) * unit }));
  };

  const w = size?.w ?? 1;
  const h = size?.h ?? 1;
  const apply = () => {
    'worklet';
    const [lo, hi] = scaleRange.get();
    const sc = Math.min(Math.max(pinch.get(), lo), hi);
    s.set(sc);
    tx.set(fx.get() * (1 - sc) + panX.get());
    ty.set(fy.get() * (1 - sc) + panY.get());
  };
  const begin = () => {
    'worklet';
    if (active.get() === 0) {
      panX.set(0);
      panY.set(0);
      pinch.set(1);
      fx.set(0);
      fy.set(0);
    }
    active.set(active.get() + 1);
  };
  const end = () => {
    'worklet';
    active.set(Math.max(active.get() - 1, 0));
    if (active.get() === 0) scheduleOnRN(commit, s.get(), tx.get(), ty.get());
  };

  const pan = Gesture.Pan()
    .minDistance(6)
    .averageTouches(true)
    .onStart(() => begin())
    .onUpdate((e) => {
      panX.set(e.translationX);
      panY.set(e.translationY);
      apply();
    })
    .onEnd(() => end());
  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      begin();
      // The content point under the fingers stays under them while zooming.
      fx.set(e.focalX - w / 2 - panX.get());
      fy.set(e.focalY - h / 2 - panY.get());
    })
    .onUpdate((e) => {
      pinch.set(e.scale);
      apply();
    })
    .onEnd(() => end());
  const tapAt = (x: number, y: number) => {
    if (!size) return;
    const unit = vw / size.w;
    onTap?.(view[0] + x * unit, view[1] + y * unit, unit, z.k);
  };
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e, success) => {
      if (success) scheduleOnRN(tapAt, e.x, e.y);
    });
  // A tap wins only if the fingers don't move enough to start a drag or pinch.
  const gesture = Gesture.Race(tap, Gesture.Simultaneous(pan, pinchGesture));

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: s.get() }],
  }));

  const step = (factor: number) => setZoom(clamp({ ...z, k: z.k * factor }));

  return (
    <View style={styles.viewport} onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ w: width, h: height });
      }}>
      {size ? (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[StyleSheet.absoluteFill, animated]}>{children(view, size.w, z.k)}</Animated.View>
        </GestureDetector>
      ) : null}
      <View style={styles.controls}>
        <ZoomButton icon="plus" label="Zoom in" disabled={z.k >= maxZoom} onPress={() => step(1.8)} />
        <ZoomButton icon="minus" label="Zoom out" disabled={z.k <= 1} onPress={() => step(1 / 1.8)} />
        <ZoomButton icon="maximize" label="Show the whole map" disabled={z.k <= 1} onPress={() => setZoom(clamp({ ...z, k: 1 }))} />
      </View>
    </View>
  );
}

function ZoomButton({ icon, label, disabled, onPress }: { icon: 'plus' | 'minus' | 'maximize'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <BouncyPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.button, sticker(2, radius.md), disabled && { opacity: 0.4 }]}>
      <Icon name={icon} size={18} />
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  controls: { position: 'absolute', right: 12, top: 12, gap: 8 },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
