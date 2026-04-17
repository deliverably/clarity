import { describe, it, expect } from "vitest";
import { extractLinksFromHtml } from "../src/lib/extractLinks.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("extractLinksFromHtml", () => {
  it("extracts hrefs with anchor text", () => {
    const html = '<a href="https://a.com/x">Hello</a><a href="#skip">x</a>';
    const links = extractLinksFromHtml(html);
    expect(links.length).toBe(1);
    expect(links[0].url).toBe("https://a.com/x");
    expect(links[0].anchor_text).toBe("Hello");
  });

  it("reads fixture file", () => {
    const raw = readFileSync(join(__dirname, "fixtures", "sample-email.html"), "utf-8");
    const links = extractLinksFromHtml(raw, "https://mysite.com/");
    expect(links.length).toBe(3);
  });
});
