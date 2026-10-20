import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../components/Button";
import { buttonStyles } from "./button-styles";

describe("buttonStyles", () => {
  const variants = ["primary", "secondary", "tertiary", "accent"] as const;
  const sizes = ["sm", "md", "lg"] as const;

  it("returns a distinct non-empty class string for every variant", () => {
    const classes = variants.map((variant) => buttonStyles({ variant }));

    for (const css of classes) {
      expect(css.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(classes).size).toBe(variants.length);
  });

  it("returns a distinct non-empty class string for every size", () => {
    const classes = sizes.map((size) => buttonStyles({ size }));

    for (const css of classes) {
      expect(css.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(classes).size).toBe(sizes.length);
  });

  it("appends an extra className last", () => {
    expect(buttonStyles({ className: "extra-x" })).toMatch(/extra-x$/);
  });

  it("Button renders exactly the classes buttonStyles produces for each variant", () => {
    for (const variant of variants) {
      const { container } = render(<Button variant={variant}>Submit</Button>);
      expect(within(container).getByRole("button").className).toBe(
        buttonStyles({ variant }),
      );
    }
  });
});