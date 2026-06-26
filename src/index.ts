/**
 * matchday-mcp — an MCP server exposing live football data (standings, matches, scorers,
 * teams) from football-data.org. Runs over stdio for Claude Desktop / Claude Code.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FootballData } from "./footballdata.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "matchday-mcp",
    version: "0.1.0",
  });

  const db = new FootballData();
  registerTools(server, db);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the MCP protocol; log to stderr.
  console.error("matchday-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting matchday-mcp:", err);
  process.exit(1);
});
