// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "to-read", label: "To read" },
  { value: "reading", label: "Reading", disabled: true },
  { value: "processed", label: "Processed" },
];

async function show(onChange: (value: string) => void) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <Select
        aria-label="Status"
        value="inbox"
        options={OPTIONS}
        onChange={onChange}
      />,
    ),
  );
  return host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
}

const list = () => document.querySelector<HTMLElement>('[role="listbox"]');
const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("Select", () => {
  it("shows the chosen label and picks an option by click", async () => {
    const onChange = vi.fn();
    const button = await show(onChange);
    expect(button.textContent).toBe("Inbox");
    expect(list()).toBeNull();

    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const chosen = list()!.querySelector('[aria-selected="true"]')!;
    expect(chosen.textContent).toBe("Inbox");

    const toRead = [...list()!.querySelectorAll<HTMLElement>('[role="option"]')][1]!;
    await act(async () => toRead.click());
    expect(onChange).toHaveBeenCalledWith("to-read");
    expect(list()).toBeNull();
  });

  it("works with the keyboard and skips disabled options", async () => {
    const onChange = vi.fn();
    const button = await show(onChange);

    await key(button, "ArrowDown");
    expect(list()).not.toBeNull();
    await key(list()!, "ArrowDown");
    await key(list()!, "ArrowDown");
    await key(list()!, "Enter");
    expect(onChange).toHaveBeenCalledWith("processed");

    await key(button, "Enter");
    await key(list()!, "Escape");
    expect(list()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("jumps to an option by its first letters", async () => {
    const onChange = vi.fn();
    const button = await show(onChange);
    await key(button, "p");
    expect(onChange).toHaveBeenCalledWith("processed");
  });
});
