# Mailee — Next Steps (Execution Queue)

## Immediate (today)
- [x] Create project blueprint
- [x] Initialize Next.js + TypeScript + Tailwind app
- [x] Initialize shadcn/ui
- [x] Create Supabase project and wire env vars
- [x] Implement auth (Supabase Auth)
- [x] Build workspace + agent setup UI

## Build Order
1. **Auth + Workspace**
2. **Agent Persona** (name, style, constraints)
3. **Contact + Event Ingestion** (signup, activated, inactive)
4. **Email Pipeline** (outbound + inbound webhook)
5. **Conversation Memory + AI Replies**
6. **Approval Modes** (auto / review / hybrid)
7. **Insights Dashboard** (activation, sentiment, churn flags)

## First End-to-End Playbook
`new_signup_checkin`
- Trigger: user signup event
- Action: send intro email from named agent
- Follow-up: if no response in 24h, send check-in
- Memory: store all replies + extracted intent
- Outcome tags: activation-help, bug, confusion, upsell-interest, churn-risk

## Key Product Rule
Every email must have a clear objective and produce one structured signal.
