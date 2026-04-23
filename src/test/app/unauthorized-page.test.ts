import { describe, expect, it, vi } from "vitest";
import UnauthorizedPage from "@/app/unauthorized/page";
import { SignOutLink } from "@/app/unauthorized/sign-out-link";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
}));

function flattenChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];
  const n = node as { props?: { children?: unknown } };
  const children = n.props?.children;
  if (!children) return [];
  return Array.isArray(children) ? children : [children];
}

function findByText(node: unknown, text: string): boolean {
  if (typeof node === "string") return node.includes(text);
  if (!node || typeof node !== "object") return false;
  const children = flattenChildren(node);
  return children.some((child) => findByText(child, text));
}

function findLinkHref(node: unknown, href: string): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { props?: { href?: string; children?: unknown } };
  if (n.props?.href === href) return true;
  return flattenChildren(node).some((child) => findLinkHref(child, href));
}

describe("unauthorized page", () => {
  it("renders heading and go-back link to /app", () => {
    const tree = UnauthorizedPage();
    expect(findByText(tree, "Access denied")).toBe(true);
    expect(findLinkHref(tree, "/app")).toBe(true);
  });

  it("sign-out control triggers explicit signOut to /auth/sign-in", () => {
    mocks.signOut.mockReset();
    const element = SignOutLink();
    const onClick = (
      element.props as { onClick: () => Promise<void> | void }
    ).onClick;
    onClick();
    expect(mocks.signOut).toHaveBeenCalledWith({
      callbackUrl: "/auth/sign-in",
      redirect: true,
    });
  });
});
