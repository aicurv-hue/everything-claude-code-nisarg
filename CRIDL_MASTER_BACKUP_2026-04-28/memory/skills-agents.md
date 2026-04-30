# Skills & Agents Reference

## ECC Skills (repos/everything-claude-code-nisarg/skills/)
Key skills for this project:
- **content-engine**: Platform-native LinkedIn/social content. Rules: adapt per platform, strong hooks, one idea per post, specifics over slogans
- **market-research**: Competitive analysis, TAM, investor diligence. Output: exec summary → findings → implications → risks → recommendation → sources
- **article-writing**: Long-form corporate thought leadership
- **api-design**: Firebase/LinkedIn API patterns
- **tdd-workflow**: TDD process for 80%+ coverage
- **verification-loop**: Verify outputs before shipping
- **deep-research**: Deep multi-angle research pipeline
- **backend-patterns**: Server-side architecture patterns
- **frontend-patterns**: Next.js/React UI patterns

## Marketing Skills (repos/marketing-skills-all/skills/)
33 skills grouped by category:

### Content & Copywriting
- **social-content**: LinkedIn, Twitter, Instagram, TikTok scheduling + formats
- **content-strategy**: Traffic + authority building, searchable vs shareable
- **copywriting**: Persuasive copy for pages and ads
- **copy-editing**: Seven Sweeps Framework for improving copy
- **ad-creative**: Ad copy generation + iteration from performance data

### Email & Lead Gen
- **email-sequence**: Welcome, nurture, re-engagement, post-purchase workflows
- **cold-email**: B2B cold emails + follow-up sequences
- **lead-magnets**: Gated content for email capture
- **popup-cro**: Popup optimization for email capture

### Paid & Performance
- **paid-ads**: Google Ads, Meta, LinkedIn ad campaigns
- **ab-test-setup**: A/B tests with statistical rigor
- **analytics-tracking**: GA4, GTM, event tracking

### CRO (Conversion Rate Optimization)
- **page-cro**: Marketing page optimization
- **form-cro**: Lead capture/contact/demo forms
- **signup-flow-cro**: Reduce friction in account creation
- **onboarding-cro**: Post-signup activation, time-to-value
- **paywall-upgrade-cro**: In-app paywalls + upgrade screens
- **churn-prevention**: Cancel flows, save offers, dunning

### SEO
- **seo-audit**: Technical, on-page, content quality audits
- **ai-seo**: Optimize for ChatGPT, Perplexity, Gemini
- **programmatic-seo**: SEO pages at scale (12 playbooks)
- **schema-markup**: Structured data for rich results
- **site-architecture**: Page hierarchy, URL structure, internal linking
- **free-tool-strategy**: Free tools for lead gen + SEO

### Growth & Revenue
- **referral-program**: Referral + affiliate program design
- **pricing-strategy**: Pricing decisions, packaging, value metrics
- **competitor-alternatives**: Comparison + alternative pages
- **revops**: Lead lifecycle, scoring, routing, pipeline
- **launch-strategy**: Product launches (ORB Framework)

### Strategic
- **product-marketing-context**: Foundational positioning + messaging
- **marketing-ideas**: 139 proven marketing ideas
- **marketing-psychology**: Mental models + psychological principles
- **sales-enablement**: Sales decks, objection handling, ROI calculators

## ECC Agents (repos/everything-claude-code-nisarg/agents/)
- **planner** (model: opus): Implementation planning, step breakdown, risk identification
- **architect** (model: opus): System design, trade-off analysis, scalability
- **tdd-guide**: TDD development cycle, 80%+ coverage
- **code-reviewer**: Post-modification review
- **security-reviewer**: Security audit before production merge
- **database-reviewer**: Firebase/Firestore schema review
- **e2e-runner**: E2E test execution (LinkedIn OAuth + posting flows)
- **doc-updater**: Keep docs in sync with code
- **refactor-cleaner**: Clean up code after feature work
- **chief-of-staff**: High-level orchestration
- **build-error-resolver**: Fix build errors
- **loop-operator**: Continuous loop operations
- **docs-lookup**: Documentation search
- **harness-optimizer**: Test harness optimization

## How Skills Are Invoked
Skills are SKILL.md instruction files. When I say "using [skill]", I read the SKILL.md and apply its framework/principles to the task at hand. No separate process needed — the skill's rules become part of my reasoning for that task.
