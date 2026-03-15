import axios from 'axios';

export interface GeoResult {
  lat: number;
  lng: number;
}

/**
 * Converts a street address (or city/state/zip) into geographic coordinates
 * using the OpenStreetMap Nominatim API (free, no API key required).
 */
export async function geocodeAddress(address: string): Promise<GeoResult> {
  const response = await axios.get<Array<{ lat: string; lon: string }>>(
    'https://nominatim.openstreetmap.org/search',
    {
      params: {
        q: address,
        format: 'json',
        limit: 1,
      },
      headers: {
        // Nominatim requires a descriptive User-Agent per their usage policy
        'User-Agent': 'fmgf-mcp/1.0.0 (Find Me Gluten Free MCP server; contact via GitHub)',
        'Accept-Language': 'en',
      },
      timeout: 10_000,
    },
  );

  if (!response.data || response.data.length === 0) {
    throw new Error(
      `Could not geocode address: "${address}". ` +
      'Try a more specific address, city + state, or postal code.',
    );
  }

  const result = response.data[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
  };
}
