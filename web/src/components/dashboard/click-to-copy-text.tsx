"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

type ClickToCopyTextProps = {
  value: string
  className?: string
}

export function ClickToCopyText({ value, className }: ClickToCopyTextProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Click to copy"
      className={cn(
        "group inline-flex items-center gap-2 text-left text-xs hover:opacity-90",
        className
      )}
    >
      <code className="break-all whitespace-pre-wrap underline decoration-dotted underline-offset-2">
        {value}
      </code>
      <span className="text-[10px] text-muted-foreground">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  )
}
