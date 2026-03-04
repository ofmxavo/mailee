export type ConversationStatus = "open" | "pending" | "closed"
export type MessageDirection = "inbound" | "outbound"
export type InsightCategory = "activation" | "churn_risk" | "upsell" | "sentiment"

export interface Agent {
  id: string
  organizationId: string
  name: string
  description: string
  tone: string
  model: string
  status: "draft" | "active" | "paused"
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  organizationId: string
  email: string
  fullName: string
  company?: string | null
  lifecycleStage: "trial" | "active" | "at_risk" | "churned"
  timezone?: string | null
  lastSeenAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  organizationId: string
  contactId: string
  inboxId: string
  agentId: string
  subject: string
  status: ConversationStatus
  lastMessageAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  organizationId: string
  conversationId: string
  contactId?: string | null
  agentId?: string | null
  direction: MessageDirection
  bodyText: string
  bodyHtml?: string | null
  sentAt?: string | null
  createdAt: string
}

export interface Insight {
  id: string
  organizationId: string
  conversationId?: string | null
  contactId?: string | null
  category: InsightCategory
  confidence: number
  summary: string
  recommendation?: string | null
  createdAt: string
}
