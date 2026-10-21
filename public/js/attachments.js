import { dbPut, dbGet, dbDelete } from "./storage.js";

const MAX_TEXT_FILE = 5 * 1024 * 1024;
const MAX_IMAGE_FILE = 650 * 1024;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|xml|html|css|js|ts|jsx|tsx|py|lua|luau|toml|yaml|yml|ini|log|sql|sh|ps1|c|h|cpp|rs|go|java|rb|env|conf|gradle|kt|swift|php|r|ipynb)$/i;
const id = () => crypto.randomUUID();
const formatBytes = (size) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;

async function parsePdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF parsing library was not loaded. You can still attach PDF metadata, but its text won't be included.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buffer = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(doc.numPages, 40); pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }
  return { text: pages.join("\n\n"), truncated: doc.numPages > 40, pages: doc.numPages };
}

export async function addFiles(fileList) {
  const accepted = [];
  for (const file of [...fileList]) {
    const mime = file.type || "application/octet-stream";
    const image = mime.startsWith("image/") && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime);
    if (image && file.size > MAX_IMAGE_FILE) throw new Error(`${file.name} is larger than the ${formatBytes(MAX_IMAGE_FILE)} image limit. Use a smaller image.`);
    if (!image && file.size > MAX_TEXT_FILE) throw new Error(`${file.name} is larger than the 5 MB local parsing limit.`);
    let kind = "metadata", text = "", dataUrl = "", detail = "Not parsed locally";
    if (image) {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Could not read image."));
        reader.readAsDataURL(file);
      });
      kind = "image"; detail = "Image ready for compatible vision models";
    } else if (TEXT_EXTENSIONS.test(file.name) || mime.startsWith("text/") || mime === "application/json") {
      text = (await file.text()).slice(0, 60_000);
      kind = "text"; detail = text.length >= 60_000 ? "Text preview limited to 60,000 characters" : "Parsed locally";
    } else if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const result = await parsePdf(file);
      text = result.text.slice(0, 60_000); kind = "text"; detail = `PDF · ${result.pages} pages${result.truncated ? " · first 40 pages parsed" : ""}`;
    }
    const item = { id: id(), name: file.name, size: file.size, sizeLabel: formatBytes(file.size), mime_type: mime, kind, text, dataUrl, detail, addedAt: Date.now() };
    await dbPut("attachments", item);
    accepted.push({ id: item.id, name: item.name, size: item.size, sizeLabel: item.sizeLabel, mime_type: item.mime_type, kind: item.kind, detail: item.detail });
  }
  return accepted;
}
export async function getAttachment(fileId) { return dbGet("attachments", fileId); }
export async function removeAttachment(fileId) { return dbDelete("attachments", fileId); }
export async function resolveMessageContent(message, canSeeImages) {
  const refs = message.attachments || [];
  const textBits = [];
  const images = [];
  for (const ref of refs) {
    const file = await getAttachment(ref.id);
    if (!file) { textBits.push(`[Previously attached file ${ref.name} is no longer available in this browser.]`); continue; }
    if (file.kind === "text" && file.text) textBits.push(`\n\n[Attached file: ${file.name}]\n${file.text}`);
    else if (file.kind === "image") {
      if (canSeeImages && file.dataUrl) images.push({ type: "image_url", image_url: { url: file.dataUrl } });
      else textBits.push(`[Attached image: ${file.name}. The selected model does not support image input.]`);
    } else textBits.push(`[Attached file: ${file.name}; ${file.mime_type}; ${formatBytes(file.size)}. No text parser is available for this format.]`);
  }
  const text = `${message.content || ""}${textBits.join("")}`.trim();
  if (images.length) return [{ type: "text", text }, ...images];
  return text;
}
