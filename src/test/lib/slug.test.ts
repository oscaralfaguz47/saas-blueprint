import { describe, it, expect } from "vitest";
import { generateSlug, isValidSlug } from "@/lib/slug";

describe("generateSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(generateSlug("  hello  ")).toBe("hello");
  });

  it("strips leading and trailing hyphens from special chars", () => {
    expect(generateSlug("--hello--")).toBe("hello");
  });

  it("collapses consecutive non-alphanumeric chars into a single hyphen", () => {
    expect(generateSlug("foo   bar")).toBe("foo-bar");
  });

  it("removes accented characters via NFKD normalization", () => {
    expect(generateSlug("café résumé")).toBe("cafe-resume");
  });

  it("removes diacritics from non-Latin scripts", () => {
    expect(generateSlug("niño mañana")).toBe("nino-manana");
  });

  it("preserves numbers", () => {
    expect(generateSlug("Chapter 42")).toBe("chapter-42");
  });

  it("preserves hyphens in the middle of the input", () => {
    expect(generateSlug("well-known topic")).toBe("well-known-topic");
  });

  it("removes punctuation", () => {
    expect(generateSlug("What's up?")).toBe("what-s-up");
  });

  it("throws when the result is empty", () => {
    expect(() => generateSlug("")).toThrow("Slug cannot be empty");
  });

  it("throws on symbols-only input", () => {
    expect(() => generateSlug("!!!")).toThrow("Slug cannot be empty");
  });
});

describe("isValidSlug", () => {
  it("returns true for a simple lowercase slug", () => {
    expect(isValidSlug("hello-world")).toBe(true);
  });

  it("returns true for a single segment", () => {
    expect(isValidSlug("hello")).toBe(true);
  });

  it("returns true for a slug with numbers", () => {
    expect(isValidSlug("chapter-42")).toBe(true);
  });

  it("returns true for a slug starting with a digit", () => {
    expect(isValidSlug("2fa-setup")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("returns false for a slug with uppercase letters", () => {
    expect(isValidSlug("Hello-World")).toBe(false);
  });

  it("returns false for a slug with consecutive hyphens", () => {
    expect(isValidSlug("foo--bar")).toBe(false);
  });

  it("returns false for a slug with a leading hyphen", () => {
    expect(isValidSlug("-foo")).toBe(false);
  });

  it("returns false for a slug with a trailing hyphen", () => {
    expect(isValidSlug("foo-")).toBe(false);
  });

  it("returns false for a slug with special characters", () => {
    expect(isValidSlug("foo_bar")).toBe(false);
  });

  it("returns false for a slug with spaces", () => {
    expect(isValidSlug("foo bar")).toBe(false);
  });
});
