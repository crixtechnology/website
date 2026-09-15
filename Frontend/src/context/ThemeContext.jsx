import { createContext, useCallback, useContext, useEffect, useState } from "react";

const THEME_KEY = "crix_theme";
const THEME_COLOR = { dark: "#060B1A", light: "#F5F7FB" };

function getInitialTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch (e) {
    return "dark";
  }
}

export const ThemeContext = createContext({ theme: "dark", toggleTheme: () => {} });

// Dark is the site's un-themed default (see global.css's bare :root) —
// light only ever applies via the data-theme="light" attribute this sets.
// The same public/index.html inline script applies that attribute before
// React mounts, using the same localStorage key, so there's no flash of
// dark-then-light for a returning visitor who picked light before.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[theme]);

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // private mode / storage disabled — theme still works for this
      // session, it just won't be remembered next visit
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
