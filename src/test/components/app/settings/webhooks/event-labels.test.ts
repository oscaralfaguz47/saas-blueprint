import { describe, expect, it } from "vitest";
import { WEBHOOK_EVENT_NAMES } from "@/lib/webhooks/event-catalog";
import { WEBHOOK_EVENT_LABELS } from "@/components/app/settings/webhooks/event-labels";

describe("WEBHOOK_EVENT_LABELS", () => {
  it("has a label for every catalog event name", () => {
    for (const name of WEBHOOK_EVENT_NAMES) {
      expect(WEBHOOK_EVENT_LABELS[name]).toBeDefined();
      expect(String(WEBHOOK_EVENT_LABELS[name]).length).toBeGreaterThan(0);
    }
  });
});
