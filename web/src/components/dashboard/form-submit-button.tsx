"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

type FormSubmitButtonProps = {
  idleLabel: string
  loadingLabel: string
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive"
  className?: string
}

export function FormSubmitButton({
  idleLabel,
  loadingLabel,
  variant = "default",
  className,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant={variant} className={className} disabled={pending}>
      {pending ? loadingLabel : idleLabel}
    </Button>
  )
}
