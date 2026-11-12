# BurgerHouse Restaurant POS — AI Voice Agent

A voice-enabled restaurant point-of-sale assistant for **BurgerHouse**, built with
[LiveKit Agents for Node.js](https://github.com/livekit/agents-js) and LiveKit Cloud.
Customers speak naturally to place orders, explore the menu, and get item details,
while the agent fetches live menu data from the BurgerHouse backend.

## What it does

- 🎙️ **Voice ordering** — customers speak to browse and order food hands-free.
- 📋 **Live menu** — menu categories and items are fetched from the BurgerHouse
  Next.js API (`/api/voice/menu`) and cached for 5 minutes.
- 🔍 **Menu search** — search by name, category, ingredient, alias, or description.
- 🧾 **Order accuracy** — the agent never invents items, prices, or availability;
  it only reports what the menu tools return.
- 🗣️ **Natural conversation** — one question at a time, short replies, handles
  interruptions gracefully.

## Tech stack

- **Runtime:** Node.js ≥ 24, pnpm ≥ 10
- **Agent SDK:** `@livekit/agents` ^1.9.3
- **STT:** AssemblyAI `universal-3-6-pro`
- **LLM:** Google Gemma 4 31B (`google/gemma-4-31b-it`)
- **TTS:** Fish Audio `s2.1-pro`
- **Turn detection:** LiveKit audio turn detector with adaptive interruptions
- **Audio enhancement:** ai-coustics QUAIL (noise cancellation)
- **Validation:** Zod

## Project structure

```
src/
  main.ts      # Agent entrypoint, voice pipeline (STT/LLM/TTS/turn handling)
  agent.ts     # Agent instructions and tools (get_menu_overview, search_menu)
  menu.ts      # Menu loading, caching, search, formatting
  agent.test.ts
```

## Environment variables

Create a `.env.local` file in the project root:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
SERVER_URL=https://your-burgerhouse-server.com
VOICE_MENU_API_SECRET=your_generated_secret_for_nextjs_server_agent
```

- `SERVER_URL` / `VOICE_MENU_API_SECRET` are used by `src/menu.ts` to fetch the menu.
- The LiveKit credentials are used by the agent runtime.

## Getting started

```bash
# Install dependencies
pnpm install

# Run in dev mode (connects to LiveKit Cloud)
pnpm dev

# Type check
pnpm typecheck

# Lint / format
pnpm lint
pnpm format

# Tests
pnpm test
```

## Agent tools

| Tool                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `get_menu_overview` | Returns the available menu categories.                                           |
| `search_menu`       | Searches menu items by keyword (name, category, ingredient, alias, description). |

## Deployment

The included `Dockerfile` builds the agent for deployment to LiveKit Cloud.
See the [LiveKit Agents deployment docs](https://docs.livekit.io/deploy/agents/) for details.

## License

See [LICENSE](LICENSE).
