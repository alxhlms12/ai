const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const base64Encode = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
export const base64Decode = (value) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
export const extensionForLanguage = (language) => ({ javascript: "js", js: "js", typescript: "ts", ts: "ts", python: "py", py: "py", json: "json", html: "html", css: "css", markdown: "md", md: "md", bash: "sh", sh: "sh", yaml: "yml", toml: "toml", sql: "sql", lua: "lua", luau: "luau", powershell: "ps1", ps1: "ps1", rust: "rs", go: "go" }[String(language || "").toLowerCase()] || "txt");

export function renderMarkdown(source = "") {
  const text = String(source);
  if (!window.marked || !window.DOMPurify) return `<div class="plain-fallback">${escapeHtml(text)}</div>`;
  const renderer = new window.marked.Renderer();
  renderer.code = ({ text: code, lang }) => {
    const metadata = String(lang || "").trim();
    const langName = (metadata.match(/^[\w+#.-]+/) || ["text"])[0];
    const filenameMatch = metadata.match(/(?:filename|file)=["']?([^\s"']+)/i);
    const filename = filenameMatch?.[1] || `generated.${extensionForLanguage(langName)}`;
    const encoded = base64Encode(code);
    return `<div class="code-card"><div class="code-card-header"><span class="code-card-language">${escapeHtml(langName)}</span><span class="code-card-filename">${escapeHtml(filenameMatch?.[1] || "")}</span><span class="grow"></span><button type="button" data-code-copy="${encoded}">Copy</button><button type="button" data-code-download="${encoded}" data-code-name="${encodeURIComponent(filename)}" data-code-lang="${escapeHtml(langName)}">Download</button></div><pre><code>${escapeHtml(code)}</code></pre></div>`;
  };
  renderer.link = ({ href, title, text: linkText }) => {
    let safeHref = "#";
    try {
      const url = new URL(href, location.href);
      if (["http:", "https:", "mailto:"].includes(url.protocol)) safeHref = url.href;
    } catch {}
    return `<a href="${escapeHtml(safeHref)}"${safeHref.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${linkText}</a>`;
  };
  const html = window.marked.parse(text, { renderer, gfm: true, breaks: false, async: false });
  return window.DOMPurify.sanitize(html, { ADD_ATTR: ["data-code-copy", "data-code-download", "data-code-name", "data-code-lang"] });
}

export function getArtifactCandidates(markdown) {
  const regex = /```([\w+#.-]+)?(?:\s+filename=["']?([^\s"'`]+)["']?)?\s*\n([\s\S]*?)```/g;
  const found = [];
  let match;
  while ((match = regex.exec(String(markdown || ""))) !== null) {
    const language = (match[1] || "text").replace(/\s.*/, "");
    const name = match[2] || `generated-${found.length + 1}.${extensionForLanguage(language)}`;
    found.push({ name, language, mime_type: mimeForLanguage(language), content: match[3] });
  }
  return found;
}
function mimeForLanguage(language) {
  const map = { js: "text/javascript", javascript: "text/javascript", ts: "text/typescript", typescript: "text/typescript", py: "text/x-python", python: "text/x-python", json: "application/json", html: "text/html", css: "text/css", md: "text/markdown", markdown: "text/markdown", xml: "application/xml", svg: "image/svg+xml", yaml: "text/yaml", yml: "text/yaml", lua: "text/x-lua", luau: "text/x-lua" };
  return map[String(language).toLowerCase()] || "text/plain;charset=utf-8";
}
