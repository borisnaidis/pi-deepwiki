# Pi DeepWiki

DeepWiki MCP integration for Pi - access AI-powered documentation for GitHub repositories.

## What is DeepWiki?

DeepWiki provides AI-generated documentation for public GitHub repositories. It analyzes the codebase and creates comprehensive wiki-style documentation covering:

- Architecture and design patterns
- API documentation
- Implementation details
- Usage examples

## Installation

### Via npm (when published)

```bash
pi install npm:pi-deepwiki
```

### Via Git

```bash
pi install git:github.com/yourusername/pi-deepwiki
```

### Local Development

```bash
pi install ~/.pi/agent/extensions/pi-deepwiki
```

## Usage

Once installed, the extension provides three tools:

### 1. DeepWiki: Read Structure

Get a hierarchical outline of documentation topics:

```
Get the wiki structure for facebook/react
```

### 2. DeepWiki: Read Contents

Get detailed documentation for a specific section:

```
Get section 2.1 from facebook/react
```

### 3. DeepWiki: Ask Question

Ask natural language questions:

```
Ask DeepWiki about React: What is the purpose of useEffect?
```

## Automatic Skill

The included skill automatically triggers when you:

- Ask "how does X work" about a GitHub repo
- Request "explain Y" for a project
- Mention "architecture of Z"
- Ask for "API documentation"
- Want to "understand implementation"

## How It Works

The extension follows a 3-step workflow:

1. **Ask** - Discover relevant sections via natural language
2. **Structure** - Get section numbers from outline
3. **Contents** - Retrieve specific, targeted documentation

This avoids the 500KB+ full wiki dumps and gives you clean, focused content.

## Supported Repositories

Any public GitHub repository indexed on DeepWiki:

- `facebook/react`
- `vercel/next.js`
- `mitsuhiko/agent-stuff`
- And thousands more...

## Requirements

- Pi Coding Agent
- No API key needed for public repositories

## License

MIT
