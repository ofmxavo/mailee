import { Resolver, resolveCname, resolveMx, resolveTxt } from "node:dns/promises"

import type { ResendDomainRecord } from "@/lib/resend"

type NormalizedRequiredRecord = {
  label: string
  host: string
  type: string
  value: string
  priority: number | null
}

export type DnsRequirementStatus = {
  label: string
  host: string
  type: string
  value: string
  priority: number | null
  present: boolean
}

type LiveRecord = {
  host: string
  type: string
  value: string
  priority: number | null
}

export type DnsConflict = {
  host: string
  type: string
  value: string
  priority: number | null
  risk: "high" | "medium"
  reason: string
}

function normalizeHostName(name: string): string {
  return name.replace(/\.$/, "").toLowerCase()
}

function normalizeTxtValue(value: string): string {
  return value.trim().replace(/^"|"$/g, "")
}

function normalizeValue(type: string, value: string): string {
  if (type === "TXT") {
    return normalizeTxtValue(value)
  }

  return normalizeHostName(value)
}

function resolveRecordHost(domain: string, name: string): string {
  const normalizedDomain = normalizeHostName(domain)
  const normalizedName = name.trim()

  if (!normalizedName) {
    return normalizedDomain
  }

  const candidate = normalizeHostName(normalizedName)

  if (candidate === normalizedDomain || candidate.endsWith(`.${normalizedDomain}`)) {
    return candidate
  }

  return normalizeHostName(`${candidate}.${normalizedDomain}`)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("DNS lookup timed out")), timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

const RESOLVER_TARGETS: Array<string | null> = ["1.1.1.1", "8.8.8.8", "9.9.9.9", "208.67.222.222"]

async function resolveLiveRecordsForTarget(params: {
  host: string
  type: string
  resolverIp: string | null
}): Promise<LiveRecord[]> {
  const { host, type, resolverIp } = params

  const resolver = resolverIp ? new Resolver() : null

  if (resolver && resolverIp) {
    resolver.setServers([resolverIp])
  }

  if (type === "MX") {
    const records = await withTimeout(resolver ? resolver.resolveMx(host) : resolveMx(host))
    return records.map((entry) => ({
      host,
      type,
      value: normalizeHostName(entry.exchange),
      priority: entry.priority,
    }))
  }

  if (type === "TXT") {
    const records = await withTimeout(resolver ? resolver.resolveTxt(host) : resolveTxt(host))
    return records.map((chunks) => ({
      host,
      type,
      value: normalizeTxtValue(chunks.join("")),
      priority: null,
    }))
  }

  if (type === "CNAME") {
    const records = await withTimeout(resolver ? resolver.resolveCname(host) : resolveCname(host))
    return records.map((entry) => ({
      host,
      type,
      value: normalizeHostName(entry),
      priority: null,
    }))
  }

  return []
}

function recordFingerprint(record: LiveRecord): string {
  return `${record.type}|${record.value}|${record.priority ?? ""}`
}

async function resolveLiveRecords(host: string, type: string): Promise<LiveRecord[]> {
  const counts = new Map<string, { record: LiveRecord; seen: number }>()
  let successfulLookups = 0

  for (const resolverIp of RESOLVER_TARGETS) {
    try {
      const records = await resolveLiveRecordsForTarget({ host, type, resolverIp })
      successfulLookups += 1

      for (const record of records) {
        const key = recordFingerprint(record)
        const existing = counts.get(key)

        if (existing) {
          existing.seen += 1
          continue
        }

        counts.set(key, { record, seen: 1 })
      }
    } catch {
      // Ignore resolver-specific lookup failures and continue with remaining resolvers.
    }
  }

  if (counts.size === 0) {
    return []
  }

  if (successfulLookups < 2) {
    // Not enough resolver agreement to trust this sample.
    return []
  }

  const threshold = Math.floor(successfulLookups / 2) + 1

  return Array.from(counts.values())
    .filter((entry) => entry.seen >= threshold)
    .map((entry) => entry.record)
}

function liveRecordMatchesRequired(live: LiveRecord, required: NormalizedRequiredRecord): boolean {
  if (live.type !== required.type || live.host !== required.host) {
    return false
  }

  if (live.value !== required.value) {
    return false
  }

  if (required.type === "MX") {
    return (live.priority ?? null) === (required.priority ?? null)
  }

  return true
}

function normalizeRequiredRecords(params: {
  domainName: string
  records: ResendDomainRecord[]
}): NormalizedRequiredRecord[] {
  return params.records
    .filter((record) => ["MX", "TXT", "CNAME"].includes(record.type.toUpperCase()))
    .map((record) => {
      const type = record.type.toUpperCase()

      return {
        label: record.record,
        host: resolveRecordHost(params.domainName, record.name),
        type,
        value: normalizeValue(type, record.value),
        priority: typeof record.priority === "number" ? record.priority : null,
      }
    })
}

export async function checkRequiredDnsRecords(params: {
  domainName: string
  records: ResendDomainRecord[]
}): Promise<DnsRequirementStatus[]> {
  const requiredRecords = normalizeRequiredRecords(params)

  const checks = await Promise.all(
    requiredRecords.map(async (required) => {
      const liveRecords = await resolveLiveRecords(required.host, required.type)
      const present = liveRecords.some((live) => liveRecordMatchesRequired(live, required))

      return {
        label: required.label,
        host: required.host,
        type: required.type,
        value: required.value,
        priority: required.priority,
        present,
      } satisfies DnsRequirementStatus
    })
  )

  return checks
}

export async function findDnsConflicts(params: {
  domainName: string
  records: ResendDomainRecord[]
}): Promise<DnsConflict[]> {
  const normalizedDomain = normalizeHostName(params.domainName)
  const requiredRecords = normalizeRequiredRecords(params)

  const groupedRequired = requiredRecords.reduce<Map<string, NormalizedRequiredRecord[]>>(
    (accumulator, record) => {
      const key = `${record.host}|${record.type}`
      const existing = accumulator.get(key) ?? []
      existing.push(record)
      accumulator.set(key, existing)
      return accumulator
    },
    new Map()
  )

  const conflicts: DnsConflict[] = []

  for (const [key, requiredForKey] of groupedRequired.entries()) {
    const [host, type] = key.split("|")
    const liveRecords = await resolveLiveRecords(host, type)

    for (const live of liveRecords) {
      const matches = requiredForKey.some((required) => liveRecordMatchesRequired(live, required))

      if (matches) {
        continue
      }

      const isRootMxConflict = type === "MX" && host === normalizedDomain
      const isSendReturnPathMx = type === "MX" && host === `send.${normalizedDomain}`

      conflicts.push({
        host,
        type,
        value: live.value,
        priority: live.priority,
        risk: isRootMxConflict ? "high" : "medium",
        reason: isRootMxConflict
          ? "Routes root-domain inbox traffic elsewhere; keeping it can block inbound verification."
          : isSendReturnPathMx
            ? "Conflicts with required return-path MX for sending."
            : "Does not match required DNS configuration for this host.",
      })
    }
  }

  // DNS forbids mixing CNAME with other record types on the same host.
  // Detect CNAME collisions even when the required record type is MX/TXT.
  const uniqueHosts = Array.from(new Set(requiredRecords.map((record) => record.host)))

  for (const host of uniqueHosts) {
    const requiredForHost = requiredRecords.filter((record) => record.host === host)
    const requiresCname = requiredForHost.some((record) => record.type === "CNAME")
    const requiredTypes = new Set(requiredForHost.map((record) => record.type))

    if (!requiresCname) {
      const liveCnameRecords = await resolveLiveRecords(host, "CNAME")

      for (const live of liveCnameRecords) {
        conflicts.push({
          host,
          type: "CNAME",
          value: live.value,
          priority: null,
          risk: "high",
          reason:
            "CNAME exists on a host that requires MX/TXT records; this blocks required DNS records from coexisting.",
        })
      }

      continue
    }

    for (const type of ["MX", "TXT"] as const) {
      if (requiredTypes.has(type)) {
        continue
      }

      const liveRecords = await resolveLiveRecords(host, type)

      for (const live of liveRecords) {
        conflicts.push({
          host,
          type,
          value: live.value,
          priority: live.priority,
          risk: "high",
          reason:
            "Host requires CNAME but also has other DNS records present; CNAME cannot coexist with MX/TXT.",
        })
      }
    }
  }

  const deduped = new Map<string, DnsConflict>()

  for (const conflict of conflicts) {
    const key = `${conflict.host}|${conflict.type}|${conflict.value}|${conflict.priority ?? ""}`

    if (!deduped.has(key)) {
      deduped.set(key, conflict)
    }
  }

  return Array.from(deduped.values())
}
