/** The person's colour choice, kept in a cookie so the server paints the right mode first. */
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

/** Dark unless the cookie says light. */
export function readTheme(value: string | undefined): Theme {
  return value === "light" ? "light" : "dark";
}
