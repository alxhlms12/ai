# OpenChat — Cloudflare Workers AI workspace

A modular, single-origin AI chat workspace. The frontend is split into small JavaScript modules and uses CSS + Web Animations API for spring-like button feedback, animated messages, sidebars, modals, cards, and user-configurable motion. The backend is a Cloudflare Worker with Workers AI binding.

## Included

- **Chat:** streaming NDJSON, Markdown rendering/sanitization, conversations in `localStorage`, responsive sidebar, stop/copy/export controls.
- **Model settings:** server-side model allowlist, temperature and output-token controls, model-aware thinking settings. Thinking controls are disabled when a model's metadata does not advertise compatible controls. Unsupported levels are rejected by the Worker too.
- **Free allocation policy:** current allowlist is restricted to models that Cloudflare has documented as available without mandatory paid billing, but Cloudflare controls eligibility, model availability, rate limits, and the shared daily neuron quota. It is not unlimited and can change. Verify models in the Cloudflare dashboard before deploying.
- **Artifacts:** code blocks can become artifact cards; the Worker can include base64 artifact content in the response schema. The frontend builds Blob downloads directly, without uploading the artifact to a file-hosting URL.
- **Image generation:** FLUX.1 Schnell through `/api/image`; the browser stores generated image blobs locally and downloads them directly.
- **Attachments:** text, source, Markdown, JSON and CSV are read locally before relevant text is sent to the model; PDFs are parsed with PDF.js; bounded image attachments are sent to the vision-capable Gemma model. Unsupported binary formats are attached as metadata rather than falsely described as parsed.
- **Plugins:** registry-backed plugin modules, including Web Proxy and Custom Instructions. Plugins can add tool definitions, add bounded system instructions, execute on the Worker, and emit activity events. User-defined plugin instructions are treated as preferences, not elevated system policy.
- **Web Proxy:** HTTPS GET only, no automatic redirects, blocks common IP-literal/private/local host patterns, has a request timeout and 512 KiB body limit. Each action emits status, response headers, content type, response preview, transfer size, duration and a `proxy-response-*` storage key.
- **DevTools:** persistent IndexedDB response snapshots with request list, headers, body preview, timing, size, export and manual GET test.
- **Appearance:** editable accent/background/panel/sidebar/text colors, font, radius, comfortable/compact density, spring/subtle/off motion, and reduced-motion accessibility support.
- **Data controls:** export chats, settings and proxy history; clear local chat/files/proxy records separately.

## Run locally

Prerequisites: current Node.js, a Cloudflare account with Workers AI enabled, and Wrangler.

```bash
npm install
npx wrangler login
npm run dev
```

No application API key or `.dev.vars` file is required. The Worker calls Workers AI through the native `AI` binding declared in `wrangler.toml`; the browser calls this same-origin Worker. Cloudflare manages the AI binding and account access.

Open the local Wrangler URL, then send a test prompt. In local development, chat/image/proxy endpoints still require Wrangler to be able to resolve the configured AI binding and your Cloudflare account to have access to the selected model.

## Deploy

```bash
npm install
npx wrangler login
npm run deploy
```

The deployed Worker uses the native Workers AI binding. No AI API key is needed in the frontend, settings, or Worker secrets.

**Deployment access note:** without an access-control layer, anyone who can reach the deployed Worker can invoke its chat, image, and proxy routes and use your account's applicable Workers AI allocation. For a private personal deployment, place Cloudflare Access or another access-control layer in front of the site. For a public deployment, add rate limits, abuse controls, quotas, and stricter egress protections. These are optional site-access protections, not Workers AI credentials.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/health` | Basic Worker health response |
| `GET /api/models` | Server-side chat-model allowlist and capability metadata |
| `GET /api/plugins` | Registered plugin metadata |
| `POST /api/chat` | Streaming NDJSON by default; set `stream: false` for a single JSON envelope |
| `POST /api/image` | Returns generated JPEG bytes for browser download |
| `POST /api/proxy` | Manual DevTools Web Proxy GET through the same restrictions |

Example chat body:

```json
{
  "model": "@cf/zai-org/glm-4.7-flash",
  "thinking": "auto",
  "temperature": 0.6,
  "max_tokens": 3072,
  "stream": true,
  "plugins": {
    "web_proxy": {"enabled": true, "prompt": "Prefer JSON endpoints."},
    "custom_instructions": {"enabled": true, "prompt": "Be concise but complete."}
  },
  "messages": [{"role": "user", "content": "Explain ReadableStream."}]
}
```

Streaming event types are `delta`, `activity`, `meta`, `done`, and `error`. The `done` event includes `model`, `artifacts`, `usage`, `finish_reason`, and `error`. Artifacts carry `content_base64`, MIME type, name, size and `delivery: "browser-download"`.

## Add a plugin

1. Create a module under `src/plugins/` and export a manifest containing an `id`, `name`, version, description and kind.
2. For prompt plugins, implement `buildInstructions(settings)`.
3. For tool plugins, declare OpenAI-style `tools` and implement `execute(name, args, context)`. Use `context.emit(event)` for transparent activity events. Keep arguments, response sizes, network access, and instruction text bounded.
4. Register the plugin in `src/plugins/registry.js`, then add its client-side defaults/settings controls in `public/js/plugins.js` and `public/js/settings.js` where applicable.
5. Add Worker-side and UI tests for validation, failure paths, limits, and event shape.

A plugin must not be able to bypass model allowlists, authentication, network egress controls, or system safety policy. Fetched website text is untrusted data and should never be adopted as instructions.

## Checks

```bash
npm run check
npm test
```

The checks do not execute live inference, confirm account-specific model quotas, or guarantee external target sites will accept proxy requests. Run `npm run dev` and exercise a real model once the account binding is configured.

## Notes and limits

- Browser chat history and settings are local to the current browser profile. The project does not require a D1 database or R2 for local download artifacts.
- IndexedDB stores response snapshots locally in the browser. “Storage keys” identify snapshots and are not public URLs.
- The Web Proxy's hostname rules are defense-in-depth, not a complete SSRF guarantee; DNS resolution and network egress policy require further tightening for a multi-user public deployment.
- Files attached to prompts are parsed on the user's side when possible, then only relevant extracted content is transmitted to the AI. Attachments are not end-to-end local inference; model-relevant contents leave the browser when included in a request.
- Some Cloudflare model input schemas evolve. Model IDs/capabilities and `reasoning_effort` settings should be rechecked against the live model docs if an invocation returns an unsupported-parameter error.
- Third-party CDN assets (Marked, DOMPurify, PDF.js, fonts) require network access. For a self-contained/offline build, vendor reviewed pinned dependencies locally.
