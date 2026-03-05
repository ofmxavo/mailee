"use server"

import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"

import { getDashboardContext } from "@/lib/dashboard-context"

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(`/dashboard/users?${type}=${encodeURIComponent(message)}`)
}

export async function uploadUsersCsvAction(formData: FormData) {
  try {
    await getDashboardContext()

    const csvFile = formData.get("users_csv")

    if (!(csvFile instanceof File) || csvFile.size <= 0) {
      redirectWithNotice("error", "Choose a CSV file before uploading.")
    }

    if (csvFile.size > 5 * 1024 * 1024) {
      redirectWithNotice("error", "CSV must be 5MB or smaller for this beta uploader.")
    }

    const fileName = csvFile.name.toLowerCase()
    const isCsvType = csvFile.type.toLowerCase().includes("csv")

    if (!fileName.endsWith(".csv") && !isCsvType) {
      redirectWithNotice("error", "Upload a valid .csv file.")
    }

    const csvText = await csvFile.text()
    const rows = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (rows.length < 2) {
      redirectWithNotice("error", "CSV needs a header row plus at least one user row.")
    }

    const headers = rows[0]
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)

    if (!headers.includes("email")) {
      redirectWithNotice("error", 'CSV header must include an "email" column.')
    }

    const userRowCount = Math.max(0, rows.length - 1)

    redirectWithNotice(
      "success",
      `CSV parsed (${userRowCount} rows detected). Queue-based import + dedupe is next.`
    )
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to process CSV: ${message}`)
  }
}
