import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { DiscogsMCP } from "./mcp";
import discogsHandler from "./discogs-handler";

export { DiscogsMCP };

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="discogs-mcp"><title>discogs-mcp</title><circle cx="256" cy="256" r="240" fill="#141414"/><circle cx="256" cy="256" r="220" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="200" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="180" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="160" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="140" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="120" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="100" fill="#c96442"/><circle cx="256" cy="256" r="100" fill="none" stroke="#8a3f27" stroke-width="2"/><circle cx="256" cy="256" r="9" fill="#f5f5f5"/></svg>`;

// 32x32 PNG rasterization of the SVG above. Google's favicon service
// (used by Anthropic to preview the connector icon) wants a real raster
// image — it doesn't rasterize SVG favicons server-side.
const LOGO_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAACPTkDJAAADq0lEQVRYCcWXv09TURTHT1sK/kIoAwM6VBONMSSwNWGqzCxsjiSQoP8B7BIY2JUEEkY3FmbCSlxKwmBwaYw6kADW31IK9nP0+7x99LUspCd5vfede873+7333V9NndfNOmhdl+WuVqu2tbVl29vbViqVrFwuW6VS8fS+vj7L5/M2OjpqxWLRxsfHLZvNXgo61W4EIFlZWbG1tTU7OjqyVCrVEpgBHRgYsOnpaZudnTXEtbKWAjY2Nmx+ft6JAdHXShIRb0fI4uKiTU5OJmpoKqBWq9nc3Jytr697jwEWaZxEyHG/ciinpqZsaWnJMpmMwqPyggDIZ2ZmbHNzs4FcgGSKLEL5VwlFUlcO5cTEhK2url4QkY6D0HOR0yZQAYa+MFdxIg3jaAMT7Lg1COCba9jDQPU4LoJ3PcSH5GGdNuLAhiO06BMw2wuFgk84JZN0dnZ24VMIMASKi0yn01EuccJkYu7s7ESrIxoBlhrLTIEkQQ6QfCoz9ZXYn03b49w1f6jjQzAxITnvmNrggEvmI8AmMzw8bMfHx+4XES8CFNCDvh57+nDQRgd7rasuDjutCy0dfLXX+wf2rvLbffzEcRCB5XI529vb883KEdjh1HsCpFZ1RgJ7MtRrC2P3rTDUbz1dGcukU/5Qx/di7J7HEJtEjh8uODEXwPYqdeqpRAiInj8buWM3upN375vdWXs+cteIjedDFmLDibkA9nasmQj89Vngww5BO0Mgn4gcLAlTnC6Ag0XWLOF2NuPfXDHtSuYHOc2wlCtOF6BTTY3xcuhWdzThwrbr+UfGEzcmJzmtTJwuoFXgVbf5jOLIPDw8TOT69O3El1om3XiY/Cy/bZrDsiSnlemY9hHI5/NRbDhTcfL+pVrzdR4FtamwJ5DTDEup4nQB3GSwpIT6ZuybzI+TU+Unlt9Pqh5LDpaEKU4XUCwWmwYyi3kAYYd7ufvBIEgyBL7a/eix5IT55ISrAk731QPP223FSiSh3Va8//lXRKyDjDwJoh5uxT4JuUByh1teXm4IVBKlDhhGYuHNe1/nWmpMOL65hh0SHWQSoZGkhEuX1pbHMUAhuUDwh6OiOPnjwnmXL/E4ZllwgVQgYJh6HhKG9b9RjYIkVCUxqsOhJYjfJyEVjNsrF0hEyEJB8TrveogXierCoCQO7PgNOfoECu74pZSrM7dX1KrHKtUTSnobPvE25ajnzW7EjlMP+D/eeALr2B+TQIP//+vYX7NQSMf+nIYirqL+B12i4UyP0rcpAAAAAElFTkSuQmCC";

function pngBytes(): Uint8Array {
	const binary = atob(LOGO_PNG_BASE64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const ROOT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>discogs-mcp</title>
<meta name="description" content="Remote MCP server for Discogs — search the music database and access your collection, wantlist, and marketplace data from Claude.">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/favicon.png">
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1.25rem;color:#222;line-height:1.55}img{display:block;margin:0 auto 1rem;width:96px;height:96px}h1{text-align:center;margin-top:0}a{color:#c96442}code{background:#f2f2f2;padding:.15em .35em;border-radius:3px}</style>
</head>
<body>
<img src="/favicon.svg" alt="discogs-mcp logo" width="96" height="96">
<h1>discogs-mcp</h1>
<p>Remote Model Context Protocol server for <a href="https://www.discogs.com">Discogs</a>. Search the music database, read your collection, wantlist, and marketplace data from Claude.</p>
<p><strong>Connect in Claude:</strong> Settings → Connectors → Add custom connector, URL <code>https://discogs-mcp.discogsmcp.workers.dev/mcp</code></p>
<p>Source and privacy policy: <a href="https://github.com/mcal8055/discogs_mcp">github.com/mcal8055/discogs_mcp</a></p>
</body>
</html>`;

const oauth = new OAuthProvider({
	apiHandler: DiscogsMCP.serve("/mcp") as never,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	clientIdMetadataDocumentEnabled: true,
	defaultHandler: discogsHandler as never,
	tokenEndpoint: "/token",
});

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === "/logo.svg" || url.pathname === "/favicon.svg") {
			return new Response(LOGO_SVG, {
				headers: {
					"Content-Type": "image/svg+xml",
					"Cache-Control": "public, max-age=86400",
				},
			});
		}
		if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.png" || url.pathname === "/logo.png") {
			return new Response(pngBytes(), {
				headers: {
					"Content-Type": url.pathname.endsWith(".ico") ? "image/x-icon" : "image/png",
					"Cache-Control": "public, max-age=86400",
				},
			});
		}
		if (url.pathname === "/" || url.pathname === "") {
			return new Response(ROOT_HTML, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "public, max-age=3600",
				},
			});
		}
		return oauth.fetch(req, env, ctx);
	},
} satisfies ExportedHandler<Env>;
