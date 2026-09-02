import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchableAssetUnitDropdown } from "./asset-unit-dropdown";

const LONG_UNIT = "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff000102030405060708090a0b0c0d0e0f";
const LONG_LABEL = "unbrokenopactokenidentifierthatexceedstherowwidth0123456789";

const OPTIONS = [
  {
    unit: "lovelace",
    label: "ADA",
    availableLabel: "5 ADA available",
    searchableText: "ada cardano",
    maxQuantity: "5000000"
  },
  {
    unit: LONG_UNIT,
    label: LONG_LABEL,
    availableLabel: "1 TAIL available",
    searchableText: `tail ${LONG_LABEL}`,
    maxQuantity: "1"
  },
  {
    unit: "99aa00",
    label: "TOK • Sample Token",
    availableLabel: "2 TOK available",
    searchableText: "tok sample token",
    maxQuantity: "2"
  }
];

function renderDropdown(overrides: { value?: string; emptyLabel?: string } = {}) {
  const onChange = vi.fn();
  render(
    <SearchableAssetUnitDropdown
      id="asset-search"
      value={overrides.value ?? "lovelace"}
      options={OPTIONS}
      onChange={onChange}
      emptyLabel={overrides.emptyLabel}
    />
  );
  // Before the popup opens, the trigger is the only button on the page, so `open`
  // never depends on which label the current selection paints onto it.
  const open = () => fireEvent.click(screen.getByRole("button"));
  const trigger = () => screen.getByRole("button", { name: "ADA" });
  return { onChange, trigger, open };
}

describe("the asset search combobox", () => {
  it("wires trigger, combobox, and listbox ARIA together", () => {
    const { trigger } = renderDropdown();

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).not.toHaveAttribute("aria-controls");

    fireEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", "asset-search-listbox");

    const listbox = screen.getByRole("listbox", { name: "ADA" });
    expect(listbox.id).toBe("asset-search-listbox");

    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-controls", "asset-search-listbox");
    expect(combobox).toHaveAttribute("aria-autocomplete", "list");
    expect(combobox).toHaveAttribute("aria-label", "Search available assets");
    // The popup opens on the currently selected asset, so it is announced first.
    expect(combobox).toHaveAttribute("aria-activedescendant", "asset-search-listbox-option-0");
    expect(document.getElementById("asset-search-listbox-option-0")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(document.getElementById("asset-search-listbox-option-1")).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("renders the popup at the page root so form scrollers cannot clip it", () => {
    const { open } = renderDropdown();
    open();

    const listbox = screen.getByRole("listbox");
    expect(listbox.parentElement!.parentElement).toBe(document.body);
    expect(listbox.closest(".fixed")).not.toBeNull();
  });

  it("moves the highlight with arrows, Home, and End, wrapping at the ends", () => {
    const { open } = renderDropdown();
    open();

    const activeId = () => screen.getByRole("combobox").getAttribute("aria-activedescendant");
    const option = (index: number) => document.getElementById(`asset-search-listbox-option-${index}`);

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(activeId()).toBe("asset-search-listbox-option-1");
    // The keyboard cursor is visible through the app's standard focus ring.
    expect(option(1)).toHaveClass("ring-1", "ring-ring");

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(activeId()).toBe("asset-search-listbox-option-2");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(activeId()).toBe("asset-search-listbox-option-0");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "End" });
    expect(activeId()).toBe("asset-search-listbox-option-2");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Home" });
    expect(activeId()).toBe("asset-search-listbox-option-0");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowUp" });
    expect(activeId()).toBe("asset-search-listbox-option-2");
  });

  it("selects the highlighted option with Enter and returns focus to the trigger", () => {
    const { onChange, trigger, open } = renderDropdown();
    open();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(LONG_UNIT);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on Escape, clears the filter, and restores focus", () => {
    const { onChange, trigger, open } = renderDropdown();
    open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sample" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());

    open();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("filters as you type and Enter picks the first filtered option", () => {
    const { onChange, open } = renderDropdown();
    open();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sample" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("TOK • Sample Token");
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-activedescendant",
      options[0]!.id
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("99aa00");
  });

  it("opens with arrows from the trigger and closes on Tab", () => {
    const { trigger } = renderDropdown();

    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // ArrowUp opens on the last option, ArrowDown would open on the selected one.
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-activedescendant",
      "asset-search-listbox-option-2"
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("wraps long option labels and keeps the trigger's accessible name complete", () => {
    const { open } = renderDropdown({ value: LONG_UNIT });
    // The trigger truncates visually only: its accessible name is the full label.
    const trigger = screen.getByRole("button", { name: LONG_LABEL });
    open();

    const selected = screen.getByRole("option", { selected: true });
    // The popup opens on the selected asset (index 1 here), not merely the first one.
    expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe(selected.id);
    const labelLine = within(selected).getByText(LONG_LABEL);
    expect(labelLine).toHaveClass("whitespace-normal", "break-words");
    expect(labelLine).not.toHaveClass("truncate");

    const visible = within(trigger).getByText(LONG_LABEL);
    expect(visible).toHaveClass("truncate");
  });

  it("announces an empty result set and drops the active descendant", () => {
    const { open } = renderDropdown();
    open();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No matching assets.");
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
  });

  it("closes when the pointer lands outside", () => {
    const { open } = renderDropdown();
    open();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent(document.body, new MouseEvent("mousedown", { bubbles: true }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when the open trigger is clicked again", () => {
    const { trigger, open } = renderDropdown();
    open();

    fireEvent.click(trigger());

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

// Positioning math against a stubbed viewport. The container reports `rect` and
// every element the same geometry; the component only reads the container's.
function stubViewport(innerHeight: number, top: number, bottom: number) {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(innerHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom,
    left: 10,
    right: 230,
    width: 220,
    height: bottom - top,
    x: 10,
    y: top,
    toJSON: () => ({})
  } as DOMRect);
}

function openPanel() {
  const { open } = renderDropdown();
  open();
  const listbox = screen.getByRole("listbox");
  const panel = listbox.parentElement!;
  return { listbox, panel };
}

describe("the popup placement in a cramped viewport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on the roomier side and clamps the list when neither side fits", () => {
    // CodeRabbit's failing case: 500px viewport, trigger at 250-290. The old
    // `rect.top > PANEL_ROOM` check opened downward into the 210px that remained.
    stubViewport(500, 250, 290);
    const { listbox, panel } = openPanel();

    expect(panel.style.top).toBe("");
    expect(panel.style.bottom).toBe("258px");
    expect(listbox.style.maxHeight).toBe("158px");
  });

  it("keeps the unconstrained downward placement when the room below fits", () => {
    stubViewport(900, 100, 140);
    const { listbox, panel } = openPanel();

    expect(panel.style.bottom).toBe("");
    expect(panel.style.top).toBe("148px");
    expect(listbox.style.maxHeight).toBe("256px");
  });

  it("clamps downward too, and shrinks to nothing before overflowing the viewport", () => {
    stubViewport(400, 40, 80);
    const { listbox } = openPanel();
    expect(listbox.style.maxHeight).toBe("228px");

    // 200px viewport, trigger at 100-140: the panel opens upward, its bottom edge
    // 108px from the viewport floor. PANEL_CHROME (84px) plus the clamped list
    // (100px headroom - 8px gap - 84px chrome = 8px) is exactly the 100px of
    // headroom above the trigger (92px panel + 108px offset = 200px), so the
    // complete panel stays inside the viewport; the list still scrolls its
    // options into reach.
    stubViewport(200, 100, 140);
    fireEvent.click(screen.getByRole("button", { name: "ADA" })); // close
    fireEvent.click(screen.getByRole("button")); // reopen, re-measure
    expect(screen.getByRole("listbox").style.maxHeight).toBe("8px");
  });
});
