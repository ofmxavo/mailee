# Mailee — Project Blueprint (v0)

## Product
Mailee is an **AI email teammate** for businesses.

Not marketing blasts. Not support deflection.
Mailee proactively starts and maintains 1:1 email conversations with each user to:
- onboard them faster
- increase activation and retention
- collect qualitative feedback
- identify upsell opportunities

## Positioning
- "AI Customer Concierge by email"
- Persistent relationship memory per end-user
- Proactive outreach + conversational follow-up

## Core Principles
1. **Proactive > reactive**: Mailee initiates check-ins based on lifecycle signals.
2. **Memory-first**: every contact has persistent thread + profile memory.
3. **Human-feel, AI-honest**: friendly persona, explicit AI disclosure.
4. **Actionable output**: each conversation should produce next-best-action insights.

## V1 ICP (narrow wedge)
B2B SaaS products with trial/self-serve onboarding (50–5,000 new signups/month).

## V1 Scope (must-have)
1. Workspace + auth
2. Agent persona setup (name, tone, rules)
3. Domain + sending setup (SPF/DKIM/DMARC guidance)
4. Event-triggered outreach (signup/day1/day3/inactive/reached-milestone)
5. Inbound reply handling + thread memory
6. AI reply generation with guardrails
7. Human approval modes (auto-send / review-required / hybrid)
8. Dashboard (activation signals, sentiment, churn-risk, upsell signals)

## V1 Explicitly Out
- Full omnichannel support
- Deep CRM replacement
- Advanced autonomous pricing/discount negotiation
- Multi-language auto-localization

## Recommended Tech Stack
- Frontend/App: Next.js + React + TypeScript + Tailwind + shadcn/ui
- Backend: Next.js route handlers + Supabase (Postgres, Auth, Storage)
- Jobs: Supabase pg_cron + queue table
- Email:
  - Outbound + inbound webhooks via provider (Postmark/Resend equivalent)
  - Custom domain DNS verification flow
- AI:
  - Primary generation model + cheaper classifier model
  - Prompt + policy layer for safety/compliance
- Infra: Vercel + GitHub

## Suggested Data Model (high-level)
- organizations
- organization_members
- agents
- inboxes
- contacts
- contact_attributes
- conversations
- messages
- lifecycle_events
- playbooks
- playbook_runs
- insights
- approvals
- audit_logs

## Critical Risks
1. Deliverability (domain warmup, reputation)
2. Hallucinations / wrong product claims
3. Over-automation (annoying users)
4. Compliance (CAN-SPAM/GDPR/consent/opt-out)
5. Identity trust (must not impersonate a human deceptively)

## Competitive Gap To Exploit
Most tools are either:
- support AI (reactive), or
- lifecycle automation (template-heavy, low memory).

Mailee wedge:
- persistent relationship memory + proactive check-ins
- persona-driven conversational continuity
- built for retention/activation outcomes, not just "send campaigns"

## 14-Day MVP Build Plan
### Days 1-2
- Scaffold app/repo
- Auth + org/workspace model
- shadcn UI base + dashboard shell

### Days 3-5
- Agent persona CRUD
- Contact + lifecycle event ingestion API
- Conversation storage + thread UI

### Days 6-8
- Outbound email send pipeline
- Inbound webhook parser + reply linking
- Rule-based trigger engine

### Days 9-11
- AI reply engine + memory retrieval
- Approval workflow modes
- Basic analytics cards

### Days 12-14
- QA pass
- Deliverability controls + opt-out handling
- Deploy on Vercel + onboarding docs

## Immediate Next Execution
1. Initialize Next.js project in `/mailee`.
2. Create Supabase schema migration for core tables.
3. Build "Create Agent" + "Connect Domain" flow first.
4. Implement one end-to-end playbook: `new_signup_checkin`.
