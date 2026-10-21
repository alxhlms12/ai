const MAX_ARTIFACTS = 8;
const MAX_ARTIFACT_BYTES = 120_000;
const MAX_TOTAL_BYTES = 300_000;
const extensionMap = {
  javascript: ["js", "text/javascript"], js: ["js", "text/javascript"],
  typescript: ["ts", "text/typescript"], ts: ["ts", "text/typescript"],
  python: ["py", "text/x-python"], py: ["py", "text/x-python"],
  json: ["json", "application/json"], html: ["html", "text/html"],
  css: ["css", "text/css"], markdown: ["md", "text/markdown"], md: ["md", "text/markdown"],
  yaml: ["yml", "text/yaml"], yml: ["yml", "text/yaml"],
  lua: ["lua", "text/x-lua"], luau: ["luau", "text/x-lua"],
  sql: ["sql", "application/sql"], xml: ["xml", "application/xml"],
  svg: ["svg", "image/svg+xml"], shell: ["sh", "text/x-shellscript"], bash: ["sh", "text/x-shellscript"]
};
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const sanitizeFilename = (value, extension) => {
  const base = String(value || `generated.${extension}`).split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").slice(0, 120);
  return base || `generated.${extension}`;
};

export function extractArtifacts(markdown) {
  const source = String(markdown || "");
  const regex = /```([\w+#.-]+)?(?:\s+filename=["']?([^\s"'`]+)["']?)?\s*\n([\s\S]*?)```/g;
  const artifacts = [];
  let total = 0;
  let match;
  while ((match = regex.exec(source)) && artifacts.length < MAX_ARTIFACTS) {
    const language = String(match[1] || "text").toLowerCase();
    const [extension, mime] = extensionMap[language] || ["txt", "text/plain;charset=utf-8"];
    const rawContent = match[3];
    const byteLength = new TextEncoder().encode(rawContent).byteLength;
    if (byteLength > MAX_ARTIFACT_BYTES || total + byteLength > MAX_TOTAL_BYTES) continue;
    const name = sanitizeFilename(match[2] || `generated-${artifacts.length + 1}.${extension}`, extension);
    artifacts.push({
      id: `artifact-${artifacts.length + 1}`,
      name,
      mime_type: mime,
      size_bytes: byteLength,
      content_base64: toBase64(rawContent),
      delivery: "browser-download"
    });
    total += byteLength;
  }
  return artifacts;
}
