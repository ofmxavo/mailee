import type {
  Agent,
  Contact,
  Conversation,
  Insight,
  Message,
} from "@/types/domain"

export const mockAgent: Agent = {
  id: "agt_01hzyzmb6f8r5w8x7w",
  organizationId: "org_01hzyxq0vpc2h9q5v3",
  name: "Maya",
  description: "Proactive onboarding concierge for self-serve trial users.",
  tone: "Warm, concise, and direct",
  model: "gpt-4.1-mini",
  status: "active",
  createdAt: "2026-03-01T09:00:00Z",
  updatedAt: "2026-03-03T06:15:00Z",
}

export const mockContacts: Contact[] = [
  {
    id: "ctc_01",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    email: "alex@northstar.dev",
    fullName: "Alex Rivera",
    company: "Northstar",
    lifecycleStage: "trial",
    timezone: "America/New_York",
    lastSeenAt: "2026-03-03T01:20:00Z",
    createdAt: "2026-03-01T10:10:00Z",
    updatedAt: "2026-03-03T01:20:00Z",
  },
  {
    id: "ctc_02",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    email: "jules@pixelpeak.io",
    fullName: "Jules Martinez",
    company: "PixelPeak",
    lifecycleStage: "active",
    timezone: "Europe/Berlin",
    lastSeenAt: "2026-03-02T21:45:00Z",
    createdAt: "2026-02-27T09:30:00Z",
    updatedAt: "2026-03-02T21:45:00Z",
  },
  {
    id: "ctc_03",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    email: "casey@orbitgrid.com",
    fullName: "Casey Chen",
    company: "OrbitGrid",
    lifecycleStage: "at_risk",
    timezone: "America/Los_Angeles",
    lastSeenAt: "2026-02-28T16:14:00Z",
    createdAt: "2026-02-24T15:02:00Z",
    updatedAt: "2026-02-28T16:14:00Z",
  },
]

export const mockConversations: Conversation[] = [
  {
    id: "cnv_01",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    contactId: "ctc_01",
    inboxId: "inb_01",
    agentId: mockAgent.id,
    subject: "Welcome to Mailee — quick setup help",
    status: "open",
    lastMessageAt: "2026-03-03T05:42:00Z",
    createdAt: "2026-03-01T10:11:00Z",
    updatedAt: "2026-03-03T05:42:00Z",
  },
  {
    id: "cnv_02",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    contactId: "ctc_02",
    inboxId: "inb_01",
    agentId: mockAgent.id,
    subject: "2-minute check-in on onboarding progress",
    status: "pending",
    lastMessageAt: "2026-03-02T21:20:00Z",
    createdAt: "2026-02-28T08:20:00Z",
    updatedAt: "2026-03-02T21:20:00Z",
  },
]

export const mockMessages: Message[] = [
  {
    id: "msg_01",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    conversationId: "cnv_01",
    contactId: "ctc_01",
    direction: "inbound",
    bodyText:
      "Hey Maya — I connected Segment but the first lifecycle event is not appearing. Any checklist you recommend?",
    sentAt: "2026-03-03T05:42:00Z",
    createdAt: "2026-03-03T05:42:00Z",
  },
  {
    id: "msg_02",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    conversationId: "cnv_01",
    agentId: mockAgent.id,
    direction: "outbound",
    bodyText:
      "Great question. Can you confirm your API key starts with `mk_live` and that the `signup_completed` event includes an email field?",
    sentAt: "2026-03-03T05:43:30Z",
    createdAt: "2026-03-03T05:43:30Z",
  },
]

export const mockInsights: Insight[] = [
  {
    id: "ins_01",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    conversationId: "cnv_01",
    contactId: "ctc_01",
    category: "activation",
    confidence: 0.89,
    summary: "Contact is blocked on first event ingestion during setup.",
    recommendation: "Surface integration checklist and offer 15-minute setup walkthrough.",
    createdAt: "2026-03-03T05:44:10Z",
  },
  {
    id: "ins_02",
    organizationId: "org_01hzyxq0vpc2h9q5v3",
    conversationId: "cnv_02",
    contactId: "ctc_02",
    category: "upsell",
    confidence: 0.73,
    summary: "Contact asked about adding multiple team inboxes.",
    recommendation: "Tag as expansion candidate and route to AE follow-up.",
    createdAt: "2026-03-02T21:25:00Z",
  },
]
