/**
 * DeepWiki MCP Extension for Pi
 *
 * Provides access to DeepWiki's AI-powered documentation for GitHub repositories
 * via the Model Context Protocol (MCP).
 *
 * Tools:
 * - deepwiki_read_structure: Get wiki outline for a repository
 * - deepwiki_read_contents: Get full wiki documentation (truncated to 50KB)
 * - deepwiki_ask_question: Ask natural language questions about a repository
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  truncateHead,
  formatSize,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  getMarkdownTheme,
  keyHint,
} from "@mariozechner/pi-coding-agent";
import { Text, Markdown, truncateToWidth, type Component } from "@mariozechner/pi-tui";

const COLLAPSED_PREVIEW_LINES = 10;

const MCP_URL = "https://mcp.deepwiki.com/mcp";

/**
 * Make a JSON-RPC request to the DeepWiki MCP server
 */
async function makeMcpRequest(body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${response.statusText}\n${text.slice(0, 200)}`);
  }

  // Parse SSE format response
  const text = await response.text();
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.startsWith("data:")) {
      try {
        return JSON.parse(line.slice(5).trim());
      } catch {
        // Continue to next line
      }
    }
  }

  // Fallback: try parsing entire response
  return JSON.parse(text);
}

/**
 * Extract text content from MCP tool result
 */
function extractContent(result: unknown): { text: string; isError: boolean } {
  if (
    typeof result === "object" &&
    result !== null &&
    "result" in result &&
    typeof result.result === "object" &&
    result.result !== null &&
    "content" in result.result &&
    Array.isArray(result.result.content) &&
    result.result.content.length > 0 &&
    typeof result.result.content[0] === "object" &&
    result.result.content[0] !== null &&
    "text" in result.result.content[0]
  ) {
    const content = result.result.content[0] as { text: string };
    const isError =
      typeof result.result === "object" &&
      result.result !== null &&
      "isError" in result.result &&
      result.result.isError === true;

    return { text: content.text, isError };
  }

  return { text: String(result), isError: false };
}

/**
 * Truncate response if needed
 */
function truncateResponse(text: string): { text: string; wasTruncated: boolean } {
  const lines = text.split("\n");

  if (text.length <= DEFAULT_MAX_BYTES && lines.length <= DEFAULT_MAX_LINES) {
    return { text, wasTruncated: false };
  }

  const truncated = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncated.content;
  result += `\n\n[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines`;
  result += ` (${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)})]`;

  return { text: result, wasTruncated: true };
}

/**
 * Parse structure text to build a map of section numbers to page titles
 * Structure format:
 *   - 1 WhisperKit Overview
 *     - 1.1 Getting Started
 *     - 1.2 Architecture Overview
 *   - 2 Core Components
 *     - 2.1 WhisperKit Interface
 */
function parseStructure(structureText: string): Map<string, string> {
  const sectionMap = new Map<string, string>();
  const lines = structureText.split("\n");
  
  // Pattern to match lines like "  - 1.2 Architecture Overview"
  // Captures: section number (e.g., "1.2") and title (e.g., "Architecture Overview")
  const sectionPattern = /^\s*-\s+(\d+(?:\.\d+)*)\s+(.+)$/;
  
  for (const line of lines) {
    const match = sectionPattern.exec(line);
    if (match) {
      const sectionNumber = match[1];
      const title = match[2].trim();
      sectionMap.set(sectionNumber, title);
    }
  }
  
  return sectionMap;
}

/**
 * Extract a specific section from wiki contents based on path
 * Paths like "2", "2.1", "4.2.1" correspond to sections in the outline
 * The content uses page titles, so we need to map section numbers to titles
 */
function extractSection(content: string, path: string, sectionMap: Map<string, string>): string | null {
  // Get the title for this section path
  const title = sectionMap.get(path);
  if (!title) {
    return null;
  }
  
  // Escape regex special characters in the title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Build pattern to match "# Page: <Title>" exactly
  const pagePattern = new RegExp(`^# Page: ${escapedTitle}$`);
  
  const lines = content.split("\n");
  
  // Find the section start
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (pagePattern.test(lines[i])) {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) {
    return null;
  }
  
  // Find the next "# Page: " section or end of content
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("# Page: ")) {
      endIndex = i;
      break;
    }
  }
  
  // Extract the section (skip the "# Page: " header line itself)
  const section = lines.slice(startIndex + 1, endIndex).join("\n").trim();
  return section;
}

function renderCollapsedMarkdownPreview(text: string, theme: { fg: (color: string, text: string) => string }): Component {
  const markdown = new Markdown(text, 0, 0, getMarkdownTheme());

  return {
    render(width: number): string[] {
      const lines = markdown.render(width);

      if (lines.length <= COLLAPSED_PREVIEW_LINES) {
        return lines;
      }

      const previewLines = lines.slice(0, COLLAPSED_PREVIEW_LINES);
      const remaining = lines.length - COLLAPSED_PREVIEW_LINES;
      const hint = truncateToWidth(
        `${theme.fg("muted", `... (${remaining} more lines,`)} ${keyHint("expandTools", "to expand")})`,
        width,
        "..."
      );

      return [...previewLines, hint];
    },

    invalidate(): void {
      markdown.invalidate();
    },
  };
}

function renderMarkdownToolResult(
  result: { content?: Array<{ type: string; text?: string }>; details?: { error?: string; isError?: boolean } },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg: (color: string, text: string) => string },
  pendingMessage: string
): Component {
  if (options.isPartial) {
    return new Text(theme.fg("warning", pendingMessage), 0, 0);
  }

  const content = result.content?.[0];
  if (content?.type !== "text" || typeof content.text !== "string") {
    return new Text(theme.fg("error", "No content"), 0, 0);
  }

  if (result.details?.error || result.details?.isError) {
    return new Text(theme.fg("error", content.text.split("\n")[0]), 0, 0);
  }

  if (options.expanded) {
    return new Markdown(content.text, 0, 0, getMarkdownTheme());
  }

  return renderCollapsedMarkdownPreview(content.text, theme);
}

export default function (pi: ExtensionAPI) {
  // Tool 1: Read wiki structure
  pi.registerTool({
    name: "deepwiki_read_structure",
    label: "DeepWiki: Read Structure",
    description:
      "Get a hierarchical outline of documentation topics for a GitHub repository. " +
      "Returns a numbered list of sections and subsections. " +
      "Use this to discover what documentation is available before asking questions.",
    parameters: Type.Object({
      repoName: Type.String({
        description: 'GitHub repository in "owner/repo" format (e.g., "facebook/react")',
      }),
    }),

    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      try {
        const result = await makeMcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "read_wiki_structure",
              arguments: {
                repoName: params.repoName,
              },
            },
          },
          signal
        );

        const { text, isError } = extractContent(result);
        const { text: finalText, wasTruncated } = truncateResponse(text);

        return {
          content: [{ type: "text", text: finalText }],
          details: {
            repoName: params.repoName,
            wasTruncated,
            isError,
          },
          isError,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { repoName: params.repoName, error: message },
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("deepwiki_read_structure "));
      text += theme.fg("accent", args.repoName);
      return new Text(text, 0, 0);
    },

    renderResult(result, options, theme) {
      return renderMarkdownToolResult(result, options, theme, "Fetching structure...");
    },
  });

  // Tool 2: Read wiki contents
  pi.registerTool({
    name: "deepwiki_read_contents",
    label: "DeepWiki: Read Contents",
    description:
      "Get a specific section of AI-generated documentation for a GitHub repository. " +
      "Use deepwiki_read_structure first to discover available section paths. " +
      "Returns complete, untruncated content for the specified section.",
    parameters: Type.Object({
      repoName: Type.String({
        description: 'GitHub repository in "owner/repo" format (e.g., "facebook/react")',
      }),
      path: Type.String({
        description:
          'Section path to extract (e.g., "2", "2.1", "4.2"). ' +
          "Must be a section number from deepwiki_read_structure output.",
      }),
    }),

    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      try {
        // First fetch the structure to map section numbers to titles
        const structureResult = await makeMcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "read_wiki_structure",
              arguments: {
                repoName: params.repoName,
              },
            },
          },
          signal
        );

        const { text: structureText, isError: structureIsError } = extractContent(structureResult);
        
        if (structureIsError) {
          return {
            content: [{ type: "text", text: `Error fetching structure: ${structureText}` }],
            details: { repoName: params.repoName, error: structureText },
            isError: true,
          };
        }

        // Parse structure to get section number -> title mapping
        const sectionMap = parseStructure(structureText);

        // Check if the requested path exists in the structure
        if (!sectionMap.has(params.path)) {
          return {
            content: [
              {
                type: "text",
                text: `Section "${params.path}" not found in structure. Use deepwiki_read_structure to see available sections.`,
              },
            ],
            details: {
              repoName: params.repoName,
              requestedPath: params.path,
              availableSections: Array.from(sectionMap.keys()).slice(0, 20),
            },
            isError: true,
          };
        }

        // Now fetch the full contents
        const result = await makeMcpRequest(
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "read_wiki_contents",
              arguments: {
                repoName: params.repoName,
              },
            },
          },
          signal
        );

        const { text: fullText, isError } = extractContent(result);

        // Extract specific section using the mapping
        const section = extractSection(fullText, params.path, sectionMap);
        if (!section) {
          const title = sectionMap.get(params.path);
          return {
            content: [
              {
                type: "text",
                text: `Section "${params.path}" (${title}) not found in content. The wiki content may be out of sync with the structure.`,
              },
            ],
            details: {
              repoName: params.repoName,
              requestedPath: params.path,
              expectedTitle: title,
            },
            isError: true,
          };
        }

        const { text: finalText, wasTruncated } = truncateResponse(section);

        return {
          content: [{ type: "text", text: finalText }],
          details: {
            repoName: params.repoName,
            path: params.path,
            wasTruncated,
            isError,
            sectionTitle: sectionMap.get(params.path),
          },
          isError,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { repoName: params.repoName, path: params.path, error: message },
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("deepwiki_read_contents "));
      text += theme.fg("accent", args.repoName);
      text += theme.fg("dim", ` (section ${args.path})`);
      return new Text(text, 0, 0);
    },

    renderResult(result, options, theme) {
      return renderMarkdownToolResult(result, options, theme, "Fetching content...");
    },
  });

  // Tool 3: Ask question
  pi.registerTool({
    name: "deepwiki_ask_question",
    label: "DeepWiki: Ask Question",
    description:
      "Ask a natural language question about a GitHub repository and get an AI-powered answer. " +
      "Answers are grounded in the repository's actual code and documentation. " +
      "Can query up to 10 repositories at once for cross-repo comparisons.",
    parameters: Type.Object({
      repoName: Type.Union(
        [
          Type.String({
            description: 'Single repository in "owner/repo" format',
          }),
          Type.Array(Type.String(), {
            description: 'Array of up to 10 repositories for cross-repo queries',
          }),
        ],
        {
          description: "Repository or repositories to query",
        }
      ),
      question: Type.String({
        description: "Natural language question about the repository(s)",
      }),
    }),

    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      try {
        const result = await makeMcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "ask_question",
              arguments: {
                repoName: params.repoName,
                question: params.question,
              },
            },
          },
          signal
        );

        const { text, isError } = extractContent(result);
        const { text: finalText, wasTruncated } = truncateResponse(text);

        return {
          content: [{ type: "text", text: finalText }],
          details: {
            repoName: params.repoName,
            question: params.question,
            wasTruncated,
            isError,
          },
          isError,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: {
            repoName: params.repoName,
            question: params.question,
            error: message,
          },
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("deepwiki_ask_question "));
      const repos = Array.isArray(args.repoName) ? args.repoName.join(", ") : args.repoName;
      text += theme.fg("accent", repos);
      text += theme.fg("dim", ` "${args.question}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, options, theme) {
      return renderMarkdownToolResult(result, options, theme, "Fetching answer...");
    },
  });

  // Notify on startup
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("DeepWiki MCP extension loaded", "info");
  });
}
