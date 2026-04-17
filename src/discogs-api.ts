import { z } from "zod";

const API_BASE = "https://api.discogs.com";

export const paginationShape = {
	per_page: z.number().int().min(1).max(100).optional().describe("Items per page (max 100)"),
	page: z.number().int().min(1).optional().describe("1-indexed page number"),
};

/** Construct the full Discogs API URL from a path and optional params. */
export function buildDiscogsUrl(
	path: string,
	params?: Record<string, string | number | undefined | null>,
): string {
	let url = `${API_BASE}${path}`;
	if (params) {
		const qs = new URLSearchParams();
		for (const [k, v] of Object.entries(params)) {
			if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
		}
		const query = qs.toString();
		if (query) url += `?${query}`;
	}
	return url;
}

export function interpretDiscogsError(status: number, body: string, path: string): string {
	let message: string | undefined;
	try {
		const parsed = JSON.parse(body) as { message?: string };
		message = parsed.message;
	} catch {
		// non-JSON body
	}
	if (status === 401)
		return `Discogs rejected the request (401). The OAuth token may have been revoked — try reconnecting.${message ? ` Details: ${message}` : ""}`;
	if (status === 403)
		return `Discogs denied access to ${path} (403). This resource may require seller privileges or different scope.${message ? ` Details: ${message}` : ""}`;
	if (status === 404)
		return `Discogs returned 404 for ${path}. The ID may be wrong or the resource was removed.${message ? ` Details: ${message}` : ""}`;
	if (status === 429)
		return `Rate-limited by Discogs (429). Wait a moment and retry — authenticated requests are capped at 60/min.`;
	return `Discogs returned ${status} for ${path}.${message ? ` Details: ${message}` : ""}`;
}
