import { ThemeProvider } from "@/components/providers/theme-provider";
import { useTheme } from "@/hooks/useTheme";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function Probe() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application theme", () => {
  it("recovers from an invalid stored class name", () => {
    localStorage.setItem("workout-theme", "dark light");
    render(<ThemeProvider defaultTheme="light"><Probe /></ThemeProvider>);
    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("light");
  });

  it("follows system theme changes and unsubscribes on unmount", () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    };
    vi.stubGlobal("matchMedia", () => media);
    const { unmount } = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(document.documentElement).toHaveClass("light");
    act(() => {
      media.matches = true;
      listeners.forEach((listener) => listener());
    });
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("light");
    unmount();
    expect(listeners.size).toBe(0);
  });
});
