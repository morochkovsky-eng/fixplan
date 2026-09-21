import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const filePath = process.argv[2];
const endpoint = process.env.UTILITY_EVAL_URL;
const token = process.env.UTILITY_EVAL_TOKEN;

if (!filePath || !endpoint || !token) {
  console.error("Usage: UTILITY_EVAL_URL=... UTILITY_EVAL_TOKEN=... node scripts/eval-utility-bill.mjs <file>");
  process.exitCode = 1;
} else {
  const mimeTypes = new Map([
    [".pdf", "application/pdf"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
    [".gif", "image/gif"],
  ]);
  const mimeType = mimeTypes.get(extname(filePath).toLowerCase());
  if (!mimeType) throw new Error("Unsupported file extension");
  const info = await stat(filePath);
  if (info.size > 20 * 1024 * 1024) throw new Error("File exceeds 20 MB");
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.set("file", new File([bytes], basename(filePath), { type: mimeType }));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
}
