# CLAUDE.md — GPTee Implementation Guide

> This file is the implementation spec for Claude Code.
> Follow every section in order. Do not skip steps.

---

## PROJECT STRUCTURE

**GPTee** consists of three repositories:

1. **Mobile Frontend** (`E:\Data\Projects\GpteeMobile`)
   - React Native 0.73.6 Android app
   - llama.rn 0.8.3 for on-device LLM inference
   - Unified chat interface with provider mode toggle
   - WebSocket relay client for P2P communication
   - Cream/beige color theme

2. **Relay Server** (`E:\Data\Projects\gpteeRelay`)
   - TypeScript WebSocket relay server
   - Handles peer discovery and message routing
   - Maintains provider list
   - Runs on Node.js

---


**Start relay server:**
```bash
cd E:\Data\Projects\gpteeRelay
npm start
```

## Notes for Claude Code

- **Do not use Expo** — this is bare RN CLI
- **Do not use fetch/axios for inference** — all inference is local via llama.rn
- **Do not add any cloud API keys** — no OpenAI, no Anthropic
- **TypeScript strict mode** — no `any` shortcuts except where explicitly noted
- When in doubt about llama.rn API, refer to: https://github.com/mybigday/llama.rn
- The relay server URL in `RelayClient.ts` must be updated with real IP before testing
