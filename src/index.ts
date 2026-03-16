import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { FmgfClient, SearchResult } from './client.js';

// ── Shared client (persists session/cookies across tool calls) ────────────────
const client = new FmgfClient();

// ── MCP server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'findmeglutenfree',
  version: '1.0.0',
});

// ── Tool: search ──────────────────────────────────────────────────────────────
server.registerTool(
  'search',
  {
    title: 'Search Find Me Gluten Free',
    description:
      'Search findmeglutenfree.com for gluten-free restaurants and businesses ' +
      'near a given address or coordinate pair. Returns a ranked list of matching places with ' +
      'ratings, distance, address, gluten-free designation, and a review snippet.',
    inputSchema: {
      q: z
        .string()
        .optional()
        .describe('What are you looking for? (Optional) — e.g. "pizza", "Thai food", "bakery"'),

      address: z
        .string()
        .optional()
        .describe(
          'Near (Address, City, State or Postal Code). Provide this OR both lat and lng. ' +
          'e.g. "1600 Pennsylvania Ave NW, Washington, DC 20500" or "Chicago, IL" or "90210"',
        ),

      lat: z
        .number()
        .finite()
        .min(-90)
        .max(90)
        .optional()
        .describe(
          'Latitude in decimal degrees, from -90 to 90. Provide this together with lng instead of address when coordinates are already known.',
        ),

      lng: z
        .number()
        .finite()
        .min(-180)
        .max(180)
        .optional()
        .describe(
          'Longitude in decimal degrees, from -180 to 180. Provide this together with lat instead of address when coordinates are already known.',
        ),

      business_type: z
        .enum(['Chains and Local Businesses', 'Local Businesses Only'])
        .default('Chains and Local Businesses')
        .describe(
          'Filter by business type.\n' +
          '• "Chains and Local Businesses" (default) — shows all results\n' +
          '• "Local Businesses Only" — excludes nationwide chain restaurants',
        ),

      gluten_free_filter: z
        .enum([
          'Show All Businesses',
          'Dedicated Gluten-Free',
          'Gluten-Free Menus',
          'Most Celiac Friendly',
        ])
        .default('Show All Businesses')
        .describe(
          'Filter by gluten-free level.\n' +
          '• "Show All Businesses" (default) — no restriction\n' +
          '• "Dedicated Gluten-Free" — entirely gluten-free establishments\n' +
          '• "Gluten-Free Menus" — places that offer a dedicated GF menu\n' +
          '• "Most Celiac Friendly" — places flagged as safest for celiacs',
        ),

      sort: z
        .enum(['Best Match', 'Rating', 'Distance', 'Last Reviewed'])
        .default('Best Match')
        .describe(
          'Sort order for results.\n' +
          '• "Best Match" (default)\n' +
          '• "Rating" — highest rated first\n' +
          '• "Distance" — closest first\n' +
          '• "Last Reviewed" — most recently reviewed first (requires login)',
        ),

      max_distance: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Maximum search radius in miles (requires a logged-in session). ' +
          'UI presets: 1, 2, 5, 10, 15, 20, 25, 50 — but any positive integer is accepted.',
        ),
    },
  },
  async (args) => {
    const hasAddress = typeof args.address === 'string' && args.address.trim().length > 0;
    const hasLat = typeof args.lat === 'number';
    const hasLng = typeof args.lng === 'number';

    if (hasAddress && (hasLat || hasLng)) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Error: Provide either address or lat/lng, not both. ' +
              'Use address for automatic geocoding, or supply both coordinates directly.',
          },
        ],
      };
    }

    if (!hasAddress && !(hasLat && hasLng)) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Error: A location is required. Provide either address, or both lat and lng decimal coordinates.',
          },
        ],
      };
    }

    if (!hasAddress && hasLat !== hasLng) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: lat and lng must be provided together when using coordinates.',
          },
        ],
      };
    }

    // Guard: features that require login
    if (args.sort === 'Last Reviewed' && !client.isLoggedIn) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Error: The "Last Reviewed" sort option requires a logged-in session.\n' +
              'Set the FMGF_USERNAME and FMGF_PASSWORD environment variables to enable login.',
          },
        ],
      };
    }

    if (args.max_distance !== undefined && !client.isLoggedIn) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Error: The max_distance parameter requires a logged-in session.\n' +
              'Set the FMGF_USERNAME and FMGF_PASSWORD environment variables to enable login.',
          },
        ],
      };
    }

    // Map friendly enum values → URL params
    const sortMap: Record<string, string> = {
      'Best Match':    '',
      'Rating':        'rating',
      'Distance':      'distance',
      'Last Reviewed': 'lastReviewed',
    };

    let results: SearchResult[];
    try {
      const searchParams = {
        q:           args.q,
        local:       args.business_type      === 'Local Businesses Only',
        dedicated:   args.gluten_free_filter === 'Dedicated Gluten-Free',
        menu:        args.gluten_free_filter === 'Gluten-Free Menus',
        cf:          args.gluten_free_filter === 'Most Celiac Friendly',
        sort:        sortMap[args.sort ?? 'Best Match'],
        maxDistance: args.max_distance,
      };

      results = await client.search(
        hasAddress
          ? {
              ...searchParams,
              address: args.address!.trim(),
            }
          : {
              ...searchParams,
              lat: args.lat!,
              lng: args.lng!,
            },
      );
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No results found for the given search criteria. Try broadening your filters or changing the location.',
          },
        ],
      };
    }

    const lines: string[] = [
      `Found ${results.length} result${results.length !== 1 ? 's' : ''}:`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`${i + 1}. ${r.name}`);
      lines.push(`   URL: ${r.url}`);

      if (r.rating !== null) {
        const reviewPart =
          r.reviewCount !== null ? ` (${r.reviewCount} review${r.reviewCount !== 1 ? 's' : ''})` : '';
        lines.push(`   Rating: ${r.rating}/5.0${reviewPart}`);
      }

      if (r.address || r.distance) {
        const distPart = r.distance ? `  •  ${r.distance}` : '';
        lines.push(`   Address: ${r.address}${distPart}`);
      }

      if (r.priceAndCategory) {
        lines.push(`   Category: ${r.priceAndCategory}`);
      }

      if (r.isDedicated) {
        lines.push(`   ✓ ${r.dedicatedText || 'Dedicated gluten-free'}`);
      }

      if (r.gfMenuItems) {
        lines.push(`   GF menu items: ${r.gfMenuItems}`);
      }

      if (r.reviewSnippet) {
        lines.push(`   Review: "${r.reviewSnippet}"`);
      }

      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Startup ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Auto-login if credentials are supplied via environment variables
  const username = process.env.FMGF_USERNAME?.trim();
  const password = process.env.FMGF_PASSWORD?.trim();

  if (username && password) {
    try {
      await client.login(username, password);
      // Use stderr so it doesn't interfere with the stdio MCP transport
      process.stderr.write(`[fmgf-mcp] Logged in as ${username}\n`);
    } catch (err) {
      process.stderr.write(
        `[fmgf-mcp] Warning: login failed — ` +
        `${err instanceof Error ? err.message : String(err)}\n` +
        `[fmgf-mcp] Continuing without a session; ` +
        `max_distance and "Last Reviewed" sort will be unavailable.\n`,
      );
    }
  } else if (username || password) {
    process.stderr.write(
      '[fmgf-mcp] Warning: both FMGF_USERNAME and FMGF_PASSWORD must be set to enable login.\n',
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[fmgf-mcp] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
