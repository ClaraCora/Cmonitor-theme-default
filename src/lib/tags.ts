/** Color names accepted by Radix Themes' color settings. */
export const RADIX_COLORS = [
  "gray", "mauve", "slate", "sage", "olive", "sand",
  "gold", "bronze", "brown", "yellow", "amber", "orange", "tomato", "red",
  "ruby", "crimson", "pink", "plum", "purple", "violet", "iris", "indigo",
  "blue", "cyan", "teal", "jade", "green", "grass", "lime", "mint", "sky",
] as const

const colors = new Set<string>(RADIX_COLORS)

export type NodeTag = { text: string; color?: string }

/**
 * Semicolons delimit labels. A valid final `<color>` is metadata rather than
 * visible text; an unknown suffix stays visible so a typo is easy to notice.
 */
export function parseTags(value: string | null | undefined): NodeTag[] {
  return (value ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.*)<([a-z]+)>$/i.exec(part)
      const color = match?.[2].toLowerCase()
      if (!match || !color || !colors.has(color) || !match[1].trim()) return { text: part }
      return { text: match[1].trim(), color }
    })
}
