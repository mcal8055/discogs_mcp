import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/discogs-oauth", () => ({
	AUTHORIZE_URL: "https://www.discogs.com/oauth/authorize",
	getRequestToken: vi.fn(),
	getAccessToken: vi.fn(),
	getIdentity: vi.fn(),
}));

const { default: app } = await import("../src/discogs-handler");
const { getAccessToken, getIdentity, getRequestToken } = await import("../src/discogs-oauth");

type EnvShape = Record<string, unknown>;

function makeEnv(overrides: EnvShape = {}): EnvShape {
	const store = new Map<string, string>();
	return {
		DISCOGS_CONSUMER_KEY: "consumer_key",
		DISCOGS_CONSUMER_SECRET: "consumer_secret",
		OAUTH_KV: {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			put: vi.fn(async (key: string, value: string) => {
				store.set(key, value);
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			}),
		},
		OAUTH_PROVIDER: {
			parseAuthRequest: vi.fn(async () => ({ clientId: "client-abc" })),
			completeAuthorization: vi.fn(async () => ({ redirectTo: "https://app.example/done" })),
		},
		...overrides,
	};
}

describe("discogs-handler /authorize", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a generic 502 when upstream request_token fails — no leaked details", async () => {
		vi.mocked(getRequestToken).mockRejectedValueOnce(
			new Error("request_token failed: 401 Invalid consumer key LEAKED_KEY_abc123"),
		);
		const env = makeEnv();
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const res = await app.request("/authorize", {}, env);

		expect(res.status).toBe(502);
		const body = await res.text();
		expect(body).toBe("Upstream authorization error");
		expect(body).not.toContain("LEAKED_KEY_abc123");
		expect(body).not.toContain("Invalid consumer");
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it("returns 400 when the OAuth provider rejects the auth request", async () => {
		const env = makeEnv({
			OAUTH_PROVIDER: {
				parseAuthRequest: vi.fn(async () => {
					throw new Error("bad");
				}),
				completeAuthorization: vi.fn(),
			},
		});
		const res = await app.request("/authorize", {}, env);
		expect(res.status).toBe(400);
	});

	it("returns 400 when clientId is missing", async () => {
		const env = makeEnv({
			OAUTH_PROVIDER: {
				parseAuthRequest: vi.fn(async () => ({ clientId: "" })),
				completeAuthorization: vi.fn(),
			},
		});
		const res = await app.request("/authorize", {}, env);
		expect(res.status).toBe(400);
	});

	it("on success, stashes in KV and redirects to the Discogs authorize URL", async () => {
		vi.mocked(getRequestToken).mockResolvedValueOnce({
			requestToken: "req_tok_xyz",
			requestTokenSecret: "req_sec_xyz",
		});
		const env = makeEnv();

		const res = await app.request("/authorize", { redirect: "manual" }, env);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("https://www.discogs.com/oauth/authorize");
		expect(location).toContain("oauth_token=req_tok_xyz");
		expect(env.OAUTH_KV as { put: ReturnType<typeof vi.fn> }).toBeDefined();
	});
});

describe("discogs-handler /callback/discogs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 400 when query params are missing", async () => {
		const env = makeEnv();
		const res = await app.request("/callback/discogs", {}, env);
		expect(res.status).toBe(400);
	});

	it("returns 400 when KV state is expired/unknown", async () => {
		const env = makeEnv();
		const res = await app.request(
			"/callback/discogs?oauth_token=unknown&oauth_verifier=v",
			{},
			env,
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("expired");
	});

	it("returns a generic 502 when access_token exchange fails", async () => {
		const env = makeEnv();
		const kv = env.OAUTH_KV as { put: (k: string, v: string) => Promise<void> };
		await kv.put(
			"discogs_req:req_tok",
			JSON.stringify({ requestTokenSecret: "req_sec", oauthReqInfo: { clientId: "c" } }),
		);
		vi.mocked(getAccessToken).mockRejectedValueOnce(
			new Error("access_token failed: 401 SENSITIVE_DETAIL"),
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const res = await app.request(
			"/callback/discogs?oauth_token=req_tok&oauth_verifier=ver",
			{},
			env,
		);

		expect(res.status).toBe(502);
		const body = await res.text();
		expect(body).toBe("Upstream authorization error");
		expect(body).not.toContain("SENSITIVE_DETAIL");
		errSpy.mockRestore();
	});

	it("returns a generic 502 when identity lookup fails", async () => {
		const env = makeEnv();
		const kv = env.OAUTH_KV as { put: (k: string, v: string) => Promise<void> };
		await kv.put(
			"discogs_req:req_tok",
			JSON.stringify({ requestTokenSecret: "req_sec", oauthReqInfo: { clientId: "c" } }),
		);
		vi.mocked(getAccessToken).mockResolvedValueOnce({
			accessToken: "acc_tok",
			accessSecret: "acc_sec",
		});
		vi.mocked(getIdentity).mockRejectedValueOnce(
			new Error("identity failed: 500 SECRET_INTERNAL_MSG"),
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const res = await app.request(
			"/callback/discogs?oauth_token=req_tok&oauth_verifier=ver",
			{},
			env,
		);

		expect(res.status).toBe(502);
		const body = await res.text();
		expect(body).toBe("Upstream authorization error");
		expect(body).not.toContain("SECRET_INTERNAL_MSG");
		errSpy.mockRestore();
	});
});
