import { describe, it, expect } from "vitest";
import { grammarResponseSchema, linksResponseSchema } from "../src/lib/schemas.js";

describe("schemas", () => {
  it("parses minimal grammar response", () => {
    const o = grammarResponseSchema.parse({
      tone: [{ label: "Neutral", explanation: "Plain update." }],
      issues: [],
    });
    expect(o.issues.length).toBe(0);
  });

  it("parses links response", () => {
    const o = linksResponseSchema.parse({
      summary: {
        total: 1,
        ok_count: 1,
        error_count: 0,
        ok_percent: 100,
        error_percent: 0,
        top_issues: [],
      },
      links: [
        {
          id: 1,
          url: "https://example.com",
          anchor_text: "x",
          location: "body",
          status: "ok",
          status_note: "ok",
          risk_level: "none",
          hops: 0,
        },
      ],
    });
    expect(o.links[0].hops).toBe(0);
  });
});
