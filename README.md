# Murder Mystery App Skill

> A Trae/Claude-style skill for building LAN-deployable murder mystery (剧本杀) Web applications — zero-dependency Node.js + Windows batch launcher + server-side authorization + per-page PDF screenshots + themed UI.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero Dependency](https://img.shields.io/badge/Dependencies-Zero-blue)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)](#)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-brightgreen)](#)

A ready-to-use skill that turns an existing 剧本杀 script (PDFs + clue images + truth documents) into a fully playable LAN-deployable Web APP with an "organizer-console / player-console" dual-end authorization structure.

---

## ✨ Features

- 🎭 **Dual-end architecture** — separate **DM (organizer) console** and **Player console**, with role-based authorization
- 🌐 **LAN-deployable** — players join via a resource code shared by the DM; no public internet required
- 📄 **Per-page PDF screenshots** — script pages are rendered as page-by-page screenshots so the DM can advance the timeline without revealing hidden clues
- 🖼️ **Clue images + truth documents** — visual clues and the truth file are managed server-side; players only see what they're entitled to
- ⏱️ **Action points (AP)** — turn-based investigation with AP economy
- 🚀 **Zero external dependencies** — pure Node.js stdlib (`http`, `fs`, `path`, `url`); works on a fresh `node:18+` install
- 🪟 **One-click Windows launcher** — a `.bat` file that starts the server and prints the LAN URL for players
- 🎨 **Themed HTML** — period/genre-specific UI (e.g. noir, period, wuxia) without external CSS frameworks
- 🔐 **Server-side authorization** — players can never bypass role checks by editing the page

---

## 📂 What's in this skill

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Skill activation spec — when to invoke, what it produces, how it routes |
| `IMPROVEMENTS.md` | Evolution log — improvements applied across iterations |
| `loop.md` | The DM-driven timeline loop (start → round → reveal → next round → end) |
| `assets/` | Theme templates, icons, sample UI snippets |
| `prompts/` | Prompt fragments the skill emits during generation |
| `references/` | Sub-scenario references (e.g. period-specific UI patterns, clue-image guidance) |

---

## 🚀 Quick Start

### 1. Use the skill in Trae

Just say one of:

- "做个剧本杀"
- "build murder mystery app"
- "把剧本做成可开局的形式"
- "做一个 N 人的剧本杀"

…or upload a script folder containing PDFs + clue images + a truth document and ask for a DM-server.

### 2. Run the generated APP locally

```bash
# Extract the generated APP to a folder, then:
node server.js
```

…or on Windows, double-click `start.bat`.

The script prints something like:

```
========================================
  Murder Mystery APP — DM Console
  LAN URL: http://192.168.1.20:8080
  Share this code with players: 8G7H2K
========================================
```

Players open the URL on their phones/laptops and enter the resource code to join.

### 3. Game flow

```
Start    →  DM greets, players join via resource code
Round 1  →  DM opens page 1 of the script; players receive clue images
Reveal   →  DM advances the timeline; truth document unlocks at the end
End      →  DM reveals the killer
```

---

## 🧠 When to invoke

This skill activates for tasks matching any of these:

| Intent | Example user phras |
| --- | --- |
| Build a murder-mystery APP | "做个剧本杀"、"build murder mystery app" |
| Make a script playable | "把剧本做成可开局的形式"、"做成可玩的 APP" |
| Run a session locally | "帮我搭一个剧本杀局"、"剧本杀 DM 服务端" |
| Generate a server-side DM console | "剧本杀 DM 服务端"、"我想做一个 N 人的剧本杀" |

It does **NOT** apply to:

- Generic Web CRUD / chat / forum apps
- Online quiz / answer apps
- Mobile native apps (React Native / Flutter)
- Apps without an organizer/player dual-end structure

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                       DM (Organizer)                        │
│  - Sees entire script (every page + every clue)              │
│  - Manages player seats, AP, timeline                       │
│  - Can advance rounds, reveal truth at end                  │
└──────────────┬──────────────────────────────┬──────────────┘
               │                  LAN         │
               ▼                               ▼
       ┌─────────────┐                 ┌─────────────┐
       │  Player 1   │                 │  Player N   │
       │  - Sees only│                 │  - Sees only│
       │    their own│                 │    their own│
       │    pages    │                 │    pages    │
       │  - AP-based │                 │  - AP-based │
       │    actions  │                 │    actions  │
       └─────────────┘                 └─────────────┘
```

The DM console and player consoles share one Node.js HTTP server. Every request is authorized server-side — clients never see clues they're not entitled to.

---

## 🛠️ Stack

- **Runtime**: Node.js 18+ (uses native `fetch`, `crypto`, `http`)
- **Frontend**: vanilla HTML/CSS/JS — no React, Vue, jQuery, Tailwind
- **PDF rendering**: native browser PDF.js or screenshot fallback
- **Storage**: JSON files in `data/` (rooms, players, clue unlocks)
- **Auth**: shared resource codes, server-side only

---

## 📋 Requirements

- Node.js **>= 18** (for native `fetch` and modern `crypto`)
- LAN with all players on the same subnet as the DM
- Modern browser on each player's device

---

## 📝 License

[MIT](LICENSE) © 2026 WhiteRobe

---

## 🤝 Contributing

PRs welcome. Particularly useful:

- New period/genre theme templates
- Better PDF page-screenshot fallbacks
- More sample clue-image patterns
- Internationalization (the current UI is Chinese-first)