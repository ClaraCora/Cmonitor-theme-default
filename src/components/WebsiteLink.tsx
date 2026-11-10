import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"

/** The hub sends this field only to signed-in callers. */
export function WebsiteLink({ url }: { url?: string }) {
  if (!url) return null
  let website: URL
  try {
    website = new URL(url)
  } catch {
    return null
  }
  if (!["http:", "https:"].includes(website.protocol) || website.username || website.password) return null

  return (
    <Button variant="outline" size="xs" asChild>
      <a
        href={website.href}
        target="_blank"
        rel="noopener noreferrer"
        title="访问官网（新窗口打开）"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ExternalLink aria-hidden="true" />
        官网
      </a>
    </Button>
  )
}
