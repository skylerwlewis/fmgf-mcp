# fmgf-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that lets AI assistants search [findmeglutenfree.com](https://www.findmeglutenfree.com/) for gluten-free restaurants and businesses near any address or coordinate pair.

## Features

- Searches [findmeglutenfree.com/search](https://www.findmeglutenfree.com/search) with the same filter options available in the website's UI
- Geocodes addresses automatically using the free [OpenStreetMap Nominatim API](https://nominatim.org/) — no API key required - only used when coordinates are not manually provided
- Optional login support to unlock **Max Distance** filtering and **Last Reviewed** sorting (credentials provided via environment variables)
- Returns structured results: name, URL, star rating, review count, address, distance, price/category, dedicated-GF status, GF menu items, and a featured review snippet

---

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18

---

## Installation & Build

```bash
# Clone / enter the project
cd fmgf-mcp

# Install dependencies
npm install

# Compile TypeScript → dist/
npm run build
```

The compiled entry point will be at `dist/index.js`.

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

Exactly one location mode is allowed per request:

- Use `address` for automatic geocoding.
- Or use both `lat` and `lng` to skip geocoding and search by coordinates directly.

### URL parameter mapping

| Tool parameter value | URL query param |
|---|---|
| `business_type: "Local Businesses Only"` | `local=t` |
| `gluten_free_filter: "Dedicated Gluten-Free"` | `dedicated=t` |
| `gluten_free_filter: "Gluten-Free Menus"` | `menu=t` |
| `gluten_free_filter: "Most Celiac Friendly"` | `cf=t` |
| `sort: "Rating"` | `sort=rating` |
| `sort: "Distance"` | `sort=distance` |
| `sort: "Last Reviewed"` | `sort=lastReviewed` |
| `max_distance: 10` | `md=10` |

---

## Optional Login

Some features require a findmeglutenfree.com account:

- **Max Distance** filtering (`max_distance` parameter)
- **Last Reviewed** sorting (`sort: "Last Reviewed"`)

### How to provide credentials

Credentials are passed as **environment variables** — the standard MCP approach for secrets. The server reads them at startup, logs in automatically, and stores the session cookie for all subsequent search calls within the same process.

| Variable | Description |
|---|---|
| `FMGF_USERNAME` | Your findmeglutenfree.com account email address |
| `FMGF_PASSWORD` | Your findmeglutenfree.com account password |

Both variables must be set together. If only one is provided, the server starts without logging in and logs a warning to stderr.

If login fails (wrong credentials, network error, etc.) the server continues running — only the login-gated features will be unavailable.

---

## Configuring with an MCP Client

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "findmeglutenfree": {
      "command": "node",
      "args": ["/absolute/path/to/fmgf-mcp/dist/index.js"]
    }
  }
}
```

#### With login credentials

```json
{
  "mcpServers": {
    "findmeglutenfree": {
      "command": "node",
      "args": ["/absolute/path/to/fmgf-mcp/dist/index.js"],
      "env": {
        "FMGF_USERNAME": "you@example.com",
        "FMGF_PASSWORD": "your-password"
      }
    }
  }
}
```

> **Security note:** `claude_desktop_config.json` is a local file that is not transmitted anywhere by the MCP framework itself. However, treat it like any config file that contains secrets — do not commit it to a public repository.

### VS Code / Copilot Chat (`.vscode/mcp.json` in your workspace)

```json
{
  "servers": {
    "findmeglutenfree": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": {
        "FMGF_USERNAME": "you@example.com",
        "FMGF_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## Development

```bash
# Run directly with tsx (no build step needed)
npm run dev

# Or run the compiled output
npm run build && npm start
```

---

## Project Structure

```
fmgf-mcp/
├── src/
│   ├── index.ts      # MCP server entry point — registers the search tool
│   ├── client.ts     # HTTP client (axios + tough-cookie), login, search, HTML parser
│   └── geocode.ts    # Address → lat/lng via OpenStreetMap Nominatim
├── dist/             # Compiled JavaScript output (git-ignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Technical Notes

- **Geocoding:** Addresses are converted to latitude/longitude using the [Nominatim API](https://nominatim.org/release-docs/latest/api/Search/). No API key is needed, but the API has a 1 req/s rate limit for reasonable use.
- **Direct coordinates:** When `lat` and `lng` are supplied, the server skips geocoding and calls the FMGF search page without the `a` query parameter.
- **Sessions:** The HTTP client maintains a `tough-cookie` `CookieJar` that persists for the lifetime of the server process. Re-launching the server will trigger a fresh login.
- **HTML parsing:** Results are scraped from the server-rendered HTML of the search results page using [cheerio](https://cheerio.js.org/).
