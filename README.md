# Cosmic Arcana — MCP Service

The AI agent's doorway into Cosmic Arcana. This service exposes the application's capabilities as MCP tools and resources, so an AI agent can decide what it needs, call it, and build a reading from the results.

## The idea

Cosmic Arcana is an AI-native fortune-telling experience.

A user asks a question — about a decision, a relationship, a career move, or simply what the coming week might bring — and an AI agent answers the way a digital fortune-teller would. It draws tarot cards, looks at what is happening in the sky, remembers previous readings, and weaves everything into a personal, entertaining prediction.

The predictions are **fictional and reflective** by design. They are an invitation to think, not a claim about the future. Real-world data such as NASA imagery or astronomical events is used as storytelling material — symbolism, themes, atmosphere — and is never presented as evidence that the future can be predicted. The product always keeps a visible line between what was *retrieved from the real world* and what was *imagined*.

The core loop:

```text
User question
    ↓
Prediction / tarot request
    ↓
AI agent
    ↓
Relevant tools and context
    ↓
Optional cosmic, historical or personal context
    ↓
AI interpretation
    ↓
Fictional prediction
    ↓
Saved reading
```

## How it is being built

Cosmic Arcana is also an experiment: how far can one software engineer push Claude Code as an engineering partner?

The project is **vibe-coded**. It is built through **Claude Code Remote Control** (a session on a development machine, driven from a smartphone) **and through Cursor**. After the hackathon, about **$190 of Cursor usage credits** remain. There is no fixed schedule and no desk required. Work happens wherever the engineer happens to be — in small pockets of free time (a commute, a queue, a quiet evening) and whenever there are tokens left that are worth spending. The roadmap is shaped as much by spontaneous ideas as by a plan. A feature often starts as a thought typed on a phone and ends as a reviewed commit.

That way of working shapes the engineering:

- **Claude implements, the engineer steers.** Most of the code is delegated; architecture, service boundaries and review stay in human hands.
- **Context lives in the repositories.** Any session must be able to pick up where the previous one stopped, so knowledge is kept in `CLAUDE.md` files, progress notes, conventions, skills and hooks — not in anyone's memory.
- **Small slices.** Tasks are cut small enough to plan, implement, review and commit from a phone screen.
- **Automated quality gates.** Tests, structured logging and consistent conventions catch what a small screen might miss.
- **Multi-repository by design.** Every service lives in its own repository, which makes cross-repository context sharing part of the experiment.
- **Deliberate context budgeting.** Short sessions reward tight prompts, focused tools and small outputs — the same discipline the product asks of its own AI agent.

## The system

Cosmic Arcana is split into independent services, each in its own repository:

| Service | Role |
| --- | --- |
| **cosmic-arcana-storefront** | Web application and BFF — everything the user sees, and the only API the browser talks to |
| **ai-service-api** | The fortune-teller's mind — predictions, tarot readings and all AI-specific business logic |
| **nasa-service-api** | The window to the real sky — retrieves, normalizes and caches NASA and astronomical data |
| **mcp-service-api** *(this repository)* | The AI agent's doorway — exposes application capabilities as MCP tools, with agent authentication and on-behalf-of access |

Around them sit a few parts that do not have their own repositories yet: a **CQRS command layer** that orchestrates use cases, a **Redis / BullMQ broker** that carries domain events, a **PostgreSQL read model** that stores readings, and a **PostgreSQL MCP server** that gives the agent restricted, user-scoped database access.

```text
User
  │
  ▼
Storefront (Next.js + BFF) ◄─────────────── queries ───────────────┐
  │                                                                │
  │ commands                                                       │
  ▼                                                                │
Command layer (NestJS CQRS)                                        │
  │                                                                │
  ├──► AI service ─────┐                                           │
  └──► NASA service ───┤                                           │
                       │ domain events                             │
                       ▼                                           │
             Broker (Redis / BullMQ) ──► Read model (PostgreSQL) ──┘


AI agent (Claude) ── MCP ──► MCP service ──┬──► Command layer
                                           └──► PostgreSQL MCP ──► cosmic_agent schema (RLS)
```

## What this service does

The Model Context Protocol (MCP) is at the core of the experiment. Instead of a hard-coded pipeline that runs every step for every question, the agent is given a set of capabilities and decides which ones a question actually requires.

- **App tools** — actions the agent can take in the application: creating a prediction, drawing tarot cards, looking up a card's meaning, asking for cosmic context. Tools hold no business logic of their own; they route to the command layer, the same way the storefront does.
- **Data resources** — read access to the user's own history, such as previous readings, served through the PostgreSQL MCP server.
- **Agent authentication** — the agent has to prove who it is before it can use anything.
- **On-behalf-of (OBO) access** — the agent never acts as itself with broad permissions. It exchanges its token for one that says *"this agent, acting for this user"*.

```text
                  AI Agent
                     │
                    MCP
                     ▼
             ┌───────────────┐
             │  MCP Server   │
             └───────┬───────┘
                     │
          ┌──────────┴──────────┐
          │                     │
      App tools           DB resources
          │                     │
          ▼                     ▼
    Command layer         PostgreSQL MCP
                                │
                                ▼
                        AI-facing schema
                                │
                                ▼
                        User-scoped data
```

### Access control

When the agent reaches for data, its token carries both identities:

- `sub` — the user the request is for (for example `user123`);
- `act` — who is actually performing it (`ai_agent`).

The PostgreSQL MCP server exposes only a restricted `cosmic_agent` schema, and row-level security (RLS) in PostgreSQL makes sure the agent sees only that user's data — even if a tool were asked for something else. The agent never gets more access than the user has, and usually gets less: only what an agent needs.

### Intentional tool design

MCP usage should be deliberate and cheap:

- a small set of well-described tools rather than one tool per endpoint;
- compact outputs — the smallest amount of information that answers the agent's need;
- no reliance on broad tool discovery or on calling every tool "just in case".

A good reading comes from the agent calling the two tools it needs, not all ten it has.

### What it does not do

It holds no business logic of its own, does not generate predictions, does not call NASA directly and has no database access beyond the restricted agent schema.
