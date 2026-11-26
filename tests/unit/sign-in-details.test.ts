import { describe, expect, it } from "vitest";
import { signInDetailsText } from "@/lib/sign-in-details";

describe("signInDetailsText", () => {
  it("puts link, username and one-time password on their own lines", () => {
    expect(
      signInDetailsText({ username: "rita", password: "rwht-h5h5", signInUrl: "https://shop.example/login" }),
    ).toBe(
      [
        "Your Print Shop sign-in",
        "Link: https://shop.example/login",
        "Username: rita",
        "One-time password: rwht-h5h5",
        "You'll choose your own password when you sign in.",
      ].join("\n"),
    );
  });

  it("leaves the link out when there is none", () => {
    const text = signInDetailsText({ username: "rita", password: "x" });
    expect(text).not.toContain("Link:");
    expect(text.split("\n")).toHaveLength(4);
  });
});
