# LinkedIn Automation SaaS — Project Framework (ECC)

This project leverages the **Everything Claude Code (ECC)** framework for high-performance AI agent orchestration and SaaS delivery.

## 🚀 Vision

A premium LinkedIn automation portal for **Individual Personal Branding** and **Corporate Company Management**, powered by a two-stage AI research/generation pipeline.

## 🛠️ Stack & Architecture

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js Server Actions & Edge Functions (Firebase Functions)
- **Database/Auth**: Firebase (LinkedIn OAuth2, token storage, post history)
- **AI Infrastructure**: ECC Framework (Agents, Skills, Commands)

---

## 🤖 ECC Agent Orchestration (Anti Gravity Rules)

Whenever performing a task, ALWAYS cross-reference the relevant ECC agent and skill.

### Core Agents to Use
- **planner**: For all implementation planning (Stage 0).
- **architect**: For system design and Firebase/Firestore decisions.
- **tdd-guide**: For all new feature development (80%+ coverage required).
- **code-reviewer**: Mandatory check after any significant modification.

### Core Skills to Leverage
- **content-engine**: Base for all LinkedIn post types and platform-native styles.
- **market-research**: Primary logic for the "AI Research" phase of the input stream.
- **article-writing**: For long-form corporate thought leadership posts.
- **api-design**: For all Firebase/LinkedIn interaction patterns.

---

## 📋 LinkedIn Automation Rules

### Input Stream (Individual & Corporate)
- **Individual**: Focus on storytelling, personal voice, and authority building.
- **Corporate**: Focus on brand consistency, industry metrics, and case studies.
- **Research Phase**: AI must perform "deep research" (using `market-research` skill) before generating a post.
- **Voice**: Support Web Speech API for hands-free topic sharing.

### Output Stream
- **Editing**: Never post directly. Always show a final editable preview.
- **Scheduling**: Post must be stored in the Firestore `scheduled_posts` collection for the cloud function to pick up.
- **Segments**: Maintain strict separation between Individual and Corporate workspaces.

---

## 📁 File Structure Conventions

- `src/app/`: Next.js App Router (pages & server actions)
- `src/components/`: UI components (Tailwind + Premium CSS)
- `src/lib/`: Core logic (Firebase client, LinkedIn API, AI pipeline)
- `repos/everything-claude-code-nisarg/`: ECC framework (pristine, DO NOT modify)
- `repos/marketing-skills-all/`: Marketing skills repo (pristine, DO NOT modify)

---

## 🧪 Verification & QA

- Run `/test-coverage` to ensure 80%+ unit/integration coverage.
- Use `/e2e` for the LinkedIn OAuth and posting flows.
- Use `/security-scan` (AgentShield) before any production-ready merge.
