---
name: deepwiki-research
description: Use when the user asks about understanding, researching, learning, or exploring a GitHub repository, its architecture, APIs, implementation details, or how to use or contribute to a project. Trigger on questions like "how does X work", "explain Y", "tell me about Z", "what is W", "architecture of", "how to use", "API documentation for", "implementation of", or when the user mentions a GitHub repository they want to understand. Use for repos like facebook/react, vercel/next.js, mitsuhiko/agent-stuff, or any owner/repo mentioned in the conversation.
---

# DeepWiki Repository Research

Use this skill when the user wants to understand or research a GitHub repository that has DeepWiki documentation available.

## Workflow

Follow this 3-step workflow to efficiently gather information:

### Step 1: Initial Discovery

Ask a broad question about the repository to identify relevant sections:

```tool
deepwiki_ask_question with
  repoName: "owner/repo"
  question: "What are the main components and architecture of this project?"
```

**Why:** This returns a focused answer and mentions specific wiki sections that are relevant.

### Step 2: Get Structure

Fetch the full wiki structure to see section numbering:

```tool
deepwiki_read_structure with
  repoName: "owner/repo"
```

**Why:** This gives you the exact section numbers (e.g., "2.1", "4.3") needed for targeted retrieval.

### Step 3: Retrieve Specific Sections

Use `deepwiki_read_contents` with the `path` parameter (required) to get detailed documentation for relevant sections:

```tool
deepwiki_read_contents with
  repoName: "owner/repo"
  path: "2.1"
```

**Why:** This returns complete, untruncated content for specific sections. The `path` parameter is required - you must get section numbers from `deepwiki_read_structure` first.

## Guidelines

### When to Use Each Tool

| Tool | Use When |
|------|----------|
| `deepwiki_ask_question` | Starting research, have a specific question, need quick overview |
| `deepwiki_read_structure` | Need to see what's documented, get section numbers for targeted retrieval |
| `deepwiki_read_contents` | **After** getting structure - need detailed docs for a specific section. `path` parameter is **required**. |

### Important Notes

1. **Always use `owner/repo` format** (e.g., `facebook/react`, not full URLs)

2. **The `path` parameter** refers to section numbers from the structure:
   - `"2"` = Section 2
   - `"2.1"` = Subsection 2.1
   - `"4.2.1"` = Deep nested section

3. **Avoid `read_contents` without path** - It returns the entire wiki which gets truncated to 50KB and loses most content

4. **Cross-repo queries** - `ask_question` supports arrays for comparing repos:
   ```
   repoName: ["facebook/react", "vercel/next.js"]
   ```

## Example Sessions

### Example 1: Learning a Framework

**User:** "Tell me about mitsuhiko/agent-stuff's extension system"

**Agent workflow:**
1. Ask: "What is the extension system architecture in this repo?"
2. Structure: Get outline to see section "2.1 Extension System"
3. Retrieve: `read_contents` with path "2.1" for full details

### Example 2: Comparing Projects

**User:** "How does React's hooks system compare to Vue's?"

**Agent workflow:**
1. Ask: "Compare the hooks/composition API in React vs Vue" with both repos
2. Structure: Get sections for both if needed
3. Retrieve: Specific sections for detailed comparison

### Example 3: Finding Implementation Details

**User:** "How does the Fiber reconciler work in React?"

**Agent workflow:**
1. Ask: "Explain the Fiber reconciler architecture"
2. Structure: Find section "4.4.1 Fiber Architecture and Data Structures"
3. Retrieve: Path "4.4.1" for complete documentation

## Error Handling

- **"Repository not found"** - The repo isn't indexed on DeepWiki. Suggest using `/web-search` instead.
- **"Section not found"** - Double-check section numbers from `read_structure` output
- **Truncated content** - If you get truncation warnings, use more specific `path` parameters

## Summary

The optimal DeepWiki workflow:
1. **ask_question** → Discover what's relevant
2. **read_structure** → Get section numbers
3. **read_contents with path** → Get detailed, untruncated docs
