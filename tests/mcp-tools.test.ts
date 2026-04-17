import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildDiscogsUrl, interpretDiscogsError, paginationShape } from "../src/discogs-api";

describe("buildDiscogsUrl", () => {
	it("builds a URL with no params", () => {
		expect(buildDiscogsUrl("/releases/123")).toBe("https://api.discogs.com/releases/123");
	});

	it("appends numeric and string params", () => {
		const url = buildDiscogsUrl("/database/search", { q: "daft punk", type: "release", per_page: 50 });
		expect(url).toBe("https://api.discogs.com/database/search?q=daft+punk&type=release&per_page=50");
	});

	it("skips undefined, null, and empty-string params", () => {
		const url = buildDiscogsUrl("/database/search", {
			q: "test",
			artist: undefined,
			label: null,
			genre: "",
			page: 2,
		});
		expect(url).toBe("https://api.discogs.com/database/search?q=test&page=2");
	});

	it("keeps folder_id=0 (zero is meaningful — the 'All' folder)", () => {
		const url = buildDiscogsUrl("/users/alice/collection/folders/0/releases", { page: 1 });
		expect(url).toBe("https://api.discogs.com/users/alice/collection/folders/0/releases?page=1");
	});

	it("URL-encodes query values", () => {
		const url = buildDiscogsUrl("/database/search", { q: "Sgt. Pepper's & hearts" });
		expect(url).toContain("q=Sgt.+Pepper%27s+%26+hearts");
	});

	it("distinguishes release vs master namespaces", () => {
		expect(buildDiscogsUrl("/releases/9999")).toBe("https://api.discogs.com/releases/9999");
		expect(buildDiscogsUrl("/masters/9999")).toBe("https://api.discogs.com/masters/9999");
	});
});

describe("interpretDiscogsError", () => {
	it("maps 401 to a reconnect hint", () => {
		const msg = interpretDiscogsError(401, "", "/releases/1");
		expect(msg).toMatch(/401/);
		expect(msg.toLowerCase()).toContain("reconnect");
	});

	it("maps 403 to a scope/seller hint including the path", () => {
		const msg = interpretDiscogsError(403, "", "/marketplace/price_suggestions/1");
		expect(msg).toMatch(/403/);
		expect(msg).toContain("/marketplace/price_suggestions/1");
	});

	it("maps 404 to a not-found hint including the path", () => {
		const msg = interpretDiscogsError(404, "", "/releases/999999999");
		expect(msg).toMatch(/404/);
		expect(msg).toContain("/releases/999999999");
	});

	it("maps 429 to a rate-limit hint", () => {
		const msg = interpretDiscogsError(429, "", "/database/search");
		expect(msg).toMatch(/429/);
		expect(msg.toLowerCase()).toContain("rate");
	});

	it("includes the Discogs-provided message when the body is JSON", () => {
		const msg = interpretDiscogsError(400, JSON.stringify({ message: "Bad query" }), "/x");
		expect(msg).toContain("Bad query");
	});

	it("tolerates non-JSON bodies without crashing", () => {
		const msg = interpretDiscogsError(500, "<html>server down</html>", "/x");
		expect(msg).toMatch(/500/);
		expect(msg).toContain("/x");
	});

	it("produces a generic message for other status codes", () => {
		const msg = interpretDiscogsError(418, "", "/teapot");
		expect(msg).toMatch(/418/);
		expect(msg).toContain("/teapot");
	});
});

describe("pagination Zod schema — boundaries", () => {
	const schema = z.object(paginationShape);

	it("accepts both fields absent", () => {
		expect(schema.parse({})).toEqual({});
	});

	it("accepts valid page and per_page", () => {
		expect(schema.parse({ page: 1, per_page: 100 })).toEqual({ page: 1, per_page: 100 });
	});

	it("rejects page=0", () => {
		expect(() => schema.parse({ page: 0 })).toThrow();
	});

	it("rejects negative page", () => {
		expect(() => schema.parse({ page: -1 })).toThrow();
	});

	it("rejects per_page=0", () => {
		expect(() => schema.parse({ per_page: 0 })).toThrow();
	});

	it("rejects per_page=101 (exceeds Discogs max)", () => {
		expect(() => schema.parse({ per_page: 101 })).toThrow();
	});

	it("rejects non-integer values", () => {
		expect(() => schema.parse({ page: 1.5 })).toThrow();
	});
});

describe("positive-integer ID schemas", () => {
	const idSchema = z.number().int().positive();

	it("accepts positive ints", () => {
		expect(idSchema.parse(1)).toBe(1);
		expect(idSchema.parse(123456)).toBe(123456);
	});

	it("rejects zero", () => {
		expect(() => idSchema.parse(0)).toThrow();
	});

	it("rejects negative", () => {
		expect(() => idSchema.parse(-1)).toThrow();
	});

	it("rejects floats", () => {
		expect(() => idSchema.parse(1.5)).toThrow();
	});
});

describe("folder_id schema — nonnegative (0 is valid)", () => {
	const folderId = z.number().int().nonnegative();

	it("accepts 0 (the 'All' folder)", () => {
		expect(folderId.parse(0)).toBe(0);
	});

	it("accepts positive", () => {
		expect(folderId.parse(5)).toBe(5);
	});

	it("rejects negative", () => {
		expect(() => folderId.parse(-1)).toThrow();
	});
});
