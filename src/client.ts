import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { geocodeAddress } from './geocode.js';

const BASE_URL = 'https://www.findmeglutenfree.com';

// A real browser User-Agent avoids bot-detection blocks
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  /** Internal business ID used by the site */
  id: string;
  /** Business name */
  name: string;
  /** Full URL to the business page on findmeglutenfree.com */
  url: string;
  /** Star rating out of 5.0, or null if not yet rated */
  rating: number | null;
  /** Total number of reviews, or null if unavailable */
  reviewCount: number | null;
  /** Street address */
  address: string;
  /** Distance from the searched location (e.g. "1.9 mi") */
  distance: string;
  /** Price indicator and category (e.g. "$$ • Bakery") */
  priceAndCategory: string;
  /** True if the business is reported to be dedicated gluten-free */
  isDedicated: boolean;
  /** Short dedication description (e.g. "Reported to be dedicated gluten-free") */
  dedicatedText: string;
  /** Comma-separated list of gluten-free menu items offered */
  gfMenuItems: string;
  /** Excerpt from a featured customer review */
  reviewSnippet: string;
}

export interface SearchParams {
  /** What are you looking for? (Optional) */
  q?: string;
  /** Near (Address, City, State or Postal Code) */
  address: string;
  /** Local Businesses Only — set true to exclude chain restaurants */
  local?: boolean;
  /** Dedicated Gluten-Free filter */
  dedicated?: boolean;
  /** Gluten-Free Menus filter */
  menu?: boolean;
  /** Most Celiac Friendly filter */
  cf?: boolean;
  /** Sort order: "" | "rating" | "distance" | "lastReviewed" */
  sort?: string;
  /** Maximum search radius in miles (requires login) */
  maxDistance?: number;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class FmgfClient {
  private readonly http: AxiosInstance;
  private _loggedIn = false;

  constructor() {
    const jar = new CookieJar();
    this.http = wrapper(
      axios.create({
        jar,
        headers: { 'User-Agent': USER_AGENT },
        maxRedirects: 10,
        withCredentials: true,
        timeout: 20_000,
      }),
    );
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  /**
   * Authenticates with findmeglutenfree.com using email + password.
   * On success the session cookie is stored and used for all subsequent requests.
   */
  async login(email: string, password: string): Promise<void> {
    const body = new URLSearchParams({ email, password });

    const response = await this.http.post<string>(
      `${BASE_URL}/login`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const html = response.data;

    // Successful login typically redirects away from /login and shows a sign-out link
    const finalUrl: string =
      (response.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? '';

    if (
      finalUrl.includes('/login') === false ||
      html.includes('Sign Out') ||
      html.includes('sign-out') ||
      html.includes('Log Out') ||
      html.includes('logout')
    ) {
      this._loggedIn = true;
      return;
    }

    // Still on the login page — credentials were rejected
    throw new Error(
      'Login failed: invalid email or password, or the site is temporarily unavailable.',
    );
  }

  /**
   * Searches findmeglutenfree.com and returns a list of matching businesses.
   * The `address` is automatically geocoded to lat/lng coordinates.
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const { lat, lng } = await geocodeAddress(params.address);

    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lng', lng.toString());
    url.searchParams.set('a', params.address);
    if (params.q)            url.searchParams.set('q',         params.q);
    if (params.local)        url.searchParams.set('local',     't');
    if (params.dedicated)    url.searchParams.set('dedicated', 't');
    if (params.menu)         url.searchParams.set('menu',      't');
    if (params.cf)           url.searchParams.set('cf',        't');
    if (params.sort)         url.searchParams.set('sort',      params.sort);
    if (params.maxDistance)  url.searchParams.set('md',        params.maxDistance.toString());

    const response = await this.http.get<string>(url.toString());
    return parseSearchResults(response.data);
  }
}

// ── HTML Parser ───────────────────────────────────────────────────────────────

function parseSearchResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // Each result is an <li data-id="..."> inside <ul id="locations-list">
  $('#locations-list li[data-id]').each((_i, el) => {
    const $el = $(el);

    const id = $el.attr('data-id') ?? '';

    // Business name & URL
    const nameEl = $el.find('.sl-title a').first();
    const name = nameEl.text().trim();
    const href = nameEl.attr('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Rating: <span class="rating-stars" title="4.5 star rating">
    const ratingTitle = $el.find('.rating-stars').attr('title') ?? '';
    const ratingMatch = ratingTitle.match(/([\d.]+)\s*star/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    // Review count: <span class="ml-1">(25)</span> immediately after rating stars
    const reviewText = $el.find('.rating-stars').next('span').text();
    const reviewMatch = reviewText.match(/\((\d+)\)/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : null;

    // Address and distance
    const address = $el.find('.sl-addr').text().trim();
    const distance = $el.find('.sl-dist').text().trim();

    // Price indicator + category (e.g. "$$ • Bakery")
    const priceAndCategory = $el.find('div.sl-tags').first().text().trim();

    // Dedicated gluten-free badge
    const dedicatedImg = $el.find('img[alt="dedicated gluten-free badge"]');
    const isDedicated = dedicatedImg.length > 0;
    const dedicatedText = isDedicated
      ? dedicatedImg.next('span').text().trim()
      : '';

    // GF menu items (h3.sl-tags)
    const gfMenuItems = $el.find('h3.sl-tags')
      .text()
      .replace(/^.*GF menu items:\s*/i, '')
      .trim();

    // Featured review snippet — strip surrounding typographic quotes
    const reviewSnippet = $el
      .find('.font-italic.small')
      .text()
      .replace(/^\s*["""]\s*/, '')
      .replace(/\s*["""]\s*$/, '')
      .trim();

    results.push({
      id,
      name,
      url,
      rating,
      reviewCount,
      address,
      distance,
      priceAndCategory,
      isDedicated,
      dedicatedText,
      gfMenuItems,
      reviewSnippet,
    });
  });

  return results;
}
