/**
 * Post-Enterprise motion constants: "Liquid Ceramic" + M3 motion.
 * Single source of truth for auth/onboarding transitions (120fps target).
 * @see https://m3.material.io/styles/motion/transitions/transition-patterns
 * @see https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
 */

/** Heavy ceramic spring: density, critically damped stop, no oscillation. */
export const SIGNAL_PHYSICS = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 36,
  mass: 1.4,
} as const;

/**
 * Fluid spring for Liquid Glass–style controls (e.g. segmented pill).
 * Softer, more organic motion so the pill glides between segments;
 * slight overshoot feels responsive and human (per Apple’s segmented control).
 */
export const FLUID_SPRING = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 26,
  mass: 1,
} as const;

/**
 * Physical, visible spring for sliding pill — low stiffness so the pill
 * clearly glides across; low damping so you see a small overshoot and settle.
 * Use when the pill position is explicitly animated (e.g. translateX).
 */
export const PILL_SLIDE_SPRING = {
  type: 'spring' as const,
  stiffness: 90,
  damping: 20,
  mass: 1,
} as const;

/** M3 standard duration (ms). Use with easing for non-spring transitions. */
export const M3_DURATION_MS = 300;
export const M3_DURATION_S = M3_DURATION_MS / 1000;

/** M3: Outgoing content fades within first ~90ms (container transform). */
export const M3_CONTENT_EXIT_MS = 90;
export const M3_CONTENT_EXIT_S = M3_CONTENT_EXIT_MS / 1000;

/**
 * M3 easing (cubic-bezier). Framer Motion accepts [x1, y1, x2, y2].
 * Emphasized decelerate: entering — fast start, gentle land.
 */
export const M3_EASING_ENTER = [0.05, 0.7, 0.1, 1] as const;
/**
 * M3 emphasized accelerate: exiting — slow start, fast leave.
 */
export const M3_EASING_EXIT = [0.3, 0, 0.8, 0.15] as const;
/** M3 emphasized: primary focus (e.g. primary button action). */
export const M3_EASING_EMPHASIZED = [0.2, 0, 0, 1] as const;

/** Fade-through enter: 300ms + M3 decelerate (heading, prompt). */
export const M3_FADE_THROUGH_ENTER = {
  duration: M3_DURATION_S,
  ease: M3_EASING_ENTER,
} as const;
/** Fade-through exit: 300ms + M3 accelerate. */
export const M3_FADE_THROUGH_EXIT = {
  duration: M3_DURATION_S,
  ease: M3_EASING_EXIT,
} as const;
/** Container transform: outgoing content exit in 90ms (M3 accelerate). */
export const M3_CONTENT_EXIT_TRANSITION = {
  duration: M3_CONTENT_EXIT_S,
  ease: M3_EASING_EXIT,
} as const;

/** M3 stagger: 50ms between children, 20ms delay (motion-system §2). */
export const M3_STAGGER_CHILDREN = 0.05;
export const M3_STAGGER_DELAY = 0.02;

/**
 * M3 Shared Axis (Y): vertical slide + fade for spatially related content (list items).
 * Use when content has a navigational/spatial relationship.
 */
export const M3_SHARED_AXIS_Y_VARIANTS = {
  hidden: { opacity: 0, y: 12 } as const,
  visible: { opacity: 1, y: 0 } as const,
};

/** M3 Shared Axis (X): horizontal slide + fade for lists. */
export const M3_SHARED_AXIS_X_VARIANTS = {
  hidden: { opacity: 0, x: -8 } as const,
  visible: { opacity: 1, x: 0 } as const,
};

/**
 * M3 Fade Through: opacity + scale for unrelated content changes.
 * Use when transitioning between views with no shared element (e.g. Growth ↔ Execution mode).
 */
export const M3_FADE_THROUGH_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96 } as const,
  visible: { opacity: 1, scale: 1 } as const,
};

/**
 * Flicker defense: force GPU layer and stabilize z-space (iOS/Chromium).
 * Apply to root motion wrappers during Sign In exit / Create Account entry.
 */
export const GPU_STABILIZE = {
  WebkitBackfaceVisibility: 'hidden' as const,
  backfaceVisibility: 'hidden' as const,
  transform: 'translateZ(0)',
  willChange: 'transform, opacity, filter' as const,
} as const;

/**
 * Approximate settling time (ms) for SIGNAL_PHYSICS spring.
 * Used to derive logo "thinking" trigger delay so state switch hides in movement blur.
 */
export const SIGNAL_SPRING_DURATION_MS = 320;

/** Delay (ms) before logo switches to "thinking" after transition starts (~0.25 * spring duration). */
export const THINKING_TRIGGER_DELAY_MS = Math.round(SIGNAL_SPRING_DURATION_MS * 0.25);
