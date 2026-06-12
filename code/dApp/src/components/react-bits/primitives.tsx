"use client";

import {
  Children,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { cn } from "@/lib/utils/cn";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

function useRevealInView<T extends Element>(
  rootMargin = "0px 0px -12% 0px",
  threshold = 0.12,
  revealOnMount = false
) {
  const ref = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isVisible, setIsVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion || revealOnMount) {
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [prefersReducedMotion, revealOnMount, rootMargin, threshold]);

  return { ref, isVisible, prefersReducedMotion };
}

type AnimatedContentProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  delay?: number;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  initialOpacity?: number;
  blur?: boolean;
  scale?: number;
  rootMargin?: string;
  threshold?: number;
  reveal?: "in-view" | "mount";
};

export function AnimatedContent({
  children,
  delay = 0,
  distance = 28,
  direction = "vertical",
  reverse = false,
  duration = 560,
  initialOpacity = 0,
  blur = false,
  scale = 0.985,
  rootMargin,
  threshold,
  reveal = "in-view",
  className,
  style,
  ...props
}: AnimatedContentProps) {
  const { ref, isVisible, prefersReducedMotion } = useRevealInView<HTMLDivElement>(
    rootMargin,
    threshold,
    reveal === "mount"
  );

  const offset = reverse ? -distance : distance;
  const xOffset = direction === "horizontal" ? offset : 0;
  const yOffset = direction === "vertical" ? offset : 0;

  const animationStyle: CSSProperties = prefersReducedMotion
    ? {}
    : {
        opacity: isVisible ? 1 : initialOpacity,
        filter: blur ? (isVisible ? "blur(0px)" : "blur(12px)") : undefined,
        transform: isVisible
          ? "translate3d(0, 0, 0) scale(1)"
          : `translate3d(${xOffset}px, ${yOffset}px, 0) scale(${scale})`,
        transitionProperty: "opacity, transform, filter",
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        transitionDelay: `${delay}ms`,
        willChange: isVisible ? undefined : "opacity, transform, filter"
      };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...animationStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

type FadeContentProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  delay?: number;
  duration?: number;
  blur?: boolean;
  initialOpacity?: number;
  rootMargin?: string;
  threshold?: number;
};

export function FadeContent({
  children,
  delay = 0,
  duration = 420,
  blur = false,
  initialOpacity = 0,
  rootMargin,
  threshold,
  className,
  style,
  ...props
}: FadeContentProps) {
  const { ref, isVisible, prefersReducedMotion } = useRevealInView<HTMLDivElement>(
    rootMargin,
    threshold
  );

  const animationStyle: CSSProperties = prefersReducedMotion
    ? {}
    : {
        opacity: isVisible ? 1 : initialOpacity,
        filter: blur ? (isVisible ? "blur(0px)" : "blur(10px)") : undefined,
        transitionProperty: "opacity, filter",
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        transitionDelay: `${delay}ms`,
        willChange: isVisible ? undefined : "opacity, filter"
      };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...animationStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

type CountUpProps = {
  to: number;
  from?: number;
  delay?: number;
  duration?: number;
  decimals?: number;
  className?: string;
  formatter?: (value: number) => string;
  rootMargin?: string;
  threshold?: number;
};

export function CountUp({
  to,
  from = 0,
  delay = 0,
  duration = 1200,
  decimals,
  className,
  formatter,
  rootMargin,
  threshold
}: CountUpProps) {
  const { ref, isVisible, prefersReducedMotion } = useRevealInView<HTMLSpanElement>(
    rootMargin,
    threshold
  );
  const previousValueRef = useRef(from);
  const [displayValue, setDisplayValue] = useState(from);

  useEffect(() => {
    const startValue = previousValueRef.current;
    previousValueRef.current = to;

    let frameId = 0;
    let timeoutId = 0;
    const shouldSkipAnimation = prefersReducedMotion || !isVisible;

    timeoutId = window.setTimeout(() => {
      if (shouldSkipAnimation) {
        setDisplayValue(to);
        return;
      }

      let animationStart: number | null = null;

      const animate = (timestamp: number) => {
        if (animationStart === null) {
          animationStart = timestamp;
        }

        const progress = Math.min((timestamp - animationStart) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(startValue + (to - startValue) * eased);

        if (progress < 1) {
          frameId = window.requestAnimationFrame(animate);
        }
      };

      frameId = window.requestAnimationFrame(animate);
    }, shouldSkipAnimation ? 0 : delay);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [delay, duration, isVisible, prefersReducedMotion, to]);

  const formattedValue = useMemo(() => {
    if (formatter) {
      return formatter(displayValue);
    }

    const resolvedDecimals =
      decimals ?? Math.max((to.toString().split(".")[1] ?? "").length, 0);

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: resolvedDecimals,
      maximumFractionDigits: resolvedDecimals
    }).format(displayValue);
  }, [decimals, displayValue, formatter, to]);

  return (
    <span ref={ref} className={className}>
      {formattedValue}
    </span>
  );
}

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
};

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(82, 255, 220, 0.18)"
}: SpotlightCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const updatePosition = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    setPosition({
      x: clientX - rect.left,
      y: clientY - rect.top
    });
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => {
        if (!prefersReducedMotion) {
          setActive(true);
        }
      }}
      onMouseLeave={() => setActive(false)}
      onMouseMove={(event) => {
        if (!prefersReducedMotion) {
          updatePosition(event.clientX, event.clientY);
        }
      }}
      onFocusCapture={() => {
        if (prefersReducedMotion) {
          return;
        }

        const rect = containerRef.current?.getBoundingClientRect();

        setPosition({
          x: rect ? rect.width / 2 : 0,
          y: rect ? rect.height / 2 : 0
        });
        setActive(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setActive(false);
        }
      }}
    >
      {!prefersReducedMotion ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            opacity: active ? 1 : 0,
            background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 72%)`
          }}
        />
      ) : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

type BorderGlowProps = {
  className?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export function BorderGlow({
  className,
  primaryColor = "rgba(82, 255, 220, 0.48)",
  secondaryColor = "rgba(35, 174, 255, 0.28)"
}: BorderGlowProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute -inset-px", className)}
      style={{ borderRadius: "inherit" }}
    >
      <div
        className="absolute inset-0 blur-xl opacity-80"
        style={{
          borderRadius: "inherit",
          background: `radial-gradient(circle at 20% 20%, ${primaryColor}, transparent 40%), radial-gradient(circle at 80% 25%, ${secondaryColor}, transparent 38%), linear-gradient(125deg, transparent 10%, ${primaryColor} 45%, ${secondaryColor} 72%, transparent 100%)`
        }}
      />
      <div
        className="absolute inset-0 opacity-90"
        style={{
          borderRadius: "inherit",
          background: `linear-gradient(125deg, transparent 10%, ${primaryColor} 38%, ${secondaryColor} 70%, transparent 100%)`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          padding: "1px"
        }}
      />
    </div>
  );
}

type AnimatedListProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  stagger?: number;
  itemClassName?: string;
  distance?: number;
  reveal?: AnimatedContentProps["reveal"];
};

export function AnimatedList({
  children,
  stagger = 70,
  itemClassName,
  distance = 18,
  reveal = "in-view",
  className,
  ...props
}: AnimatedListProps) {
  const items = Children.toArray(children);

  return (
    <div className={className} {...props}>
      {items.map((child, index) => (
        <AnimatedContent
          key={isValidElement(child) && child.key != null ? child.key : index}
          delay={index * stagger}
          distance={distance}
          reveal={reveal}
          className={itemClassName}
        >
          {child}
        </AnimatedContent>
      ))}
    </div>
  );
}

type SoftAuroraProps = {
  className?: string;
};

export function SoftAurora({ className }: SoftAuroraProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="user-soft-aurora-blob user-soft-aurora-blob--one" />
      <div className="user-soft-aurora-blob user-soft-aurora-blob--two" />
      <div className="user-soft-aurora-blob user-soft-aurora-blob--three" />
    </div>
  );
}
