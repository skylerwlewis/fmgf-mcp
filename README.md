# fmgf-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that lets AI assistants search [findmeglutenfree.com](https://www.findmeglutenfree.com/) for gluten-free restaurants and businesses near any address or coordinate pair.

## Features

- Searches [findmeglutenfree.com/search](https://www.findmeglutenfree.com/search) with the same filter options available in the website's UI
- Geocodes addresses automatically using the free [OpenStreetMap Nominatim API](https://nominatim.org/) — no API key required
- Optional login support to unlock **Max Distance** filtering and **Last Reviewed** sorting (credentials provided via environment variables)
- Returns structured results: name, URL, star rating, review count, address, distance, price/category, dedicated-GF status, GF menu items, and a featured review snippet

---

## Installation

> **Requires [Node.js](https://nodejs.org/) ≥ 18** for `npx` to work.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "findmeglutenfree": {
      "command": "npx",
      "args": ["-y", "@skylerwlewis/fmgf-mcp"]
    }
  }
}
```

### VS Code / Copilot Chat

Add to your `.vscode/mcp.json` in your workspace, or your user-level `mcp.json`:

```json
{
  "servers": {
    "findmeglutenfree": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@skylerwlewis/fmgf-mcp"]
    }
  }
}
```

### With Login Credentials

Some features require a findmeglutenfree.com account (see [Optional Login](#optional-login)). Pass your credentials as environment variables:

**Claude Desktop**
```json
{
  "mcpServers": {
    "findmeglutenfree": {
      "command": "npx",
      "args": ["-y", "@skylerwlewis/fmgf-mcp"],
      "env": {
        "FMGF_USERNAME": "you@example.com",
        "FMGF_PASSWORD": "your-password"
      }
    }
  }
}
```

**VS Code / Copilot Chat**
```json
{
  "servers": {
    "findmeglutenfree": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@skylerwlewis/fmgf-mcp"],
      "env": {
        "FMGF_USERNAME": "you@example.com",
        "FMGF_PASSWORD": "your-password"
      }
    }
  }
}
```

> **Security note:** These config files are local and not transmitted anywhere by the MCP framework. Treat them like any config file containing secrets — do not commit them to a public repository.

---

## Search Tool

The server exposes one tool: **`search`**

### Parameters

These parameters match the filter fields on [findmeglutenfree.com/search](https://www.findmeglutenfree.com/search) as closely as possible.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | string | No | — | **What are you looking for? (Optional)** — e.g. `"pizza"`, `"Thai food"`, `"bakery"` |
| `address` | string | Conditionally | — | **Near (Address, City, State or Postal Code)**. Provide this OR both `lat` and `lng` — e.g. `"1600 Pennsylvania Ave NW, Washington, DC 20500"` or `"Chicago, IL"` |
| `lat` | number | Conditionally | — | Latitude in decimal degrees from `-90` to `90`. Provide together with `lng` instead of `address` when coordinates are already known. |
| `lng` | number | Conditionally | — | Longitude in decimal degrees from `-180` to `180`. Provide together with `lat` instead of `address` when coordinates are already known. |
| `business_type` | enum | No | `"Chains and Local Businesses"` | `"Chains and Local Businesses"` or `"Local Businesses Only"` |
| `gluten_free_filter` | enum | No | `"Show All Businesses"` | `"Show All Businesses"` · `"Dedicated Gluten-Free"` · `"Gluten-Free Menus"` · `"Most Celiac Friendly"` |
| `sort` | enum | No | `"Best Match"` | `"Best Match"` · `"Rating"` · `"Distance"` · `"Last Reviewed"` *(requires login)* |
| `max_distance` | integer (miles) | No | — | Maximum search radius in miles *(requires login)*. UI presets: 1, 2, 5, 10, 15, 20, 25, 50 — any positive integer accepted. |

Exactly one location mode is required per request:

- Use `address` for automatic geocoding.
- Or use both `lat` and `lng` to skip geocoding and search by coordinates directly.

---

## Optional Login

Some features require a findmeglutenfree.com account:

- **Max Distance** filtering (`max_distance` parameter)
- **Last Reviewed** sorting (`sort: "Last Reviewed"`)

Credentials are passed as environment variables (see [Installation](#installation) above). The server reads them at startup, logs in automatically, and stores the session cookie for all subsequent searches within the same process.

| Variable | Description |
|---|---|
| `FMGF_USERNAME` | Your findmeglutenfree.com account email address |
| `FMGF_PASSWORD` | Your findmeglutenfree.com account password |

Both variables must be set together. If only one is provided, or if login fails, the server continues running — only the login-gated features will be unavailable.

---

## Development

```bash
# Install dependencies
npm install

# Run directly with tsx (no build step needed)
npm run dev

# Or compile TypeScript and run
npm run build && npm start
```
