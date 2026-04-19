"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ThemeLogoProps = {
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

export function ThemeLogo({
  width,
  height,
  className,
  priority,
}: ThemeLogoProps) {
  const [isDark, setIsDark] = useState(() => {
    // Read data-theme synchronously on first render
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute(
        "data-theme"
      ) !== "light";
    }
    // SSR default — public pages are always dark
    return true;
  });

  useEffect(() => {
    // Sync with current theme on mount
    const current = document.documentElement
      .getAttribute("data-theme");
    setIsDark(current !== "light");

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const theme = document.documentElement
        .getAttribute("data-theme");
      setIsDark(theme !== "light");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <Image
      src={isDark
        ? "/relitrue-logo-dark.svg"
        : "/relitrue-logo.svg"}
      alt="Relitrue"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
