# Discord Server Cloner

A command-line tool for cloning Discord server structure and selected content from one server to another. The tool supports cloning roles, channels, categories, emojis, and a limited number of recent messages.

---

## Features

* Clone roles, categories, and channels
* Clone custom emojis
* Clone recent messages (up to 50 per channel)
* Built-in handling for Discord rate limits
* Simple and interactive command-line interface

---

## Requirements

* Node.js v18 or higher

---

## Installation

```bash
git clone https://github.com/NerdBlud/DiscordServerCloner.git
cd DiscordServerCloner
npm install
```

---

## Usage

Run the tool:

```bash
node server-cloner.js
```

Follow the interactive prompts:

1. User token
2. Source server ID
3. Destination server ID

---
