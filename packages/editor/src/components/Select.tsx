import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Shown before the label, in the button and in the list: an icon or a dot. */
  icon?: ReactNode;
  disabled?: boolean;
  /** The language of the label, as a language list names each language in its own. */
  lang?: string;
}

export interface SelectProps<T extends string = string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  /** Shown in the button when no option has the value. */
  placeholder?: string;
  id?: string;
  className?: string;
  /** The list's own class, for a wider or narrower list. */
  listClassName?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

/**
 * A dropdown to pick one of a few options, in the UI kit's style rather
 * than the system's: 28px rows, the app's tint for the chosen option,
 * and an optional icon or dot before each label. It works with the
 * keyboard as a native select does: arrows, Enter, Escape and the first
 * letters of a label.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  id,
  className,
  listClassName,
  disabled,
  title,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  // Inside a modal dialog the list goes into the dialog, or the dialog's
  // top layer would cover it.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  // The active option, for placing the list without placing it again on every move.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const listId = useId();
  const chosen = options.find((option) => option.value === value);

  const enabled = (index: number) => !options[index]?.disabled;
  const step = (from: number, by: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const next = (from + by * i + options.length * 2) % options.length;
      if (enabled(next)) return next;
    }
    return from;
  };

  const show = () => {
    if (disabled) return;
    const at = options.findIndex((option) => option.value === value);
    setActive(at >= 0 ? at : step(-1, 1));
    setHost(trigger.current?.closest("dialog") ?? document.body);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    if (option.value !== value) onChange(option.value);
  };

  // Below the button, or above it when there is no room; as wide as the
  // button at least, and kept inside the window.
  useLayoutEffect(() => {
    const anchor = trigger.current;
    const floating = list.current;
    if (!open || !anchor || !floating) return;
    return autoUpdate(anchor, floating, () => {
      void computePosition(anchor, floating, {
        strategy: "fixed",
        placement: "bottom-start",
        middleware: [
          offset(4),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableHeight, rects }) {
              floating.style.minWidth = `${rects.reference.width}px`;
              floating.style.maxHeight = `${Math.max(120, Math.min(320, availableHeight))}px`;
            },
          }),
        ],
      }).then(({ x, y }) => {
        floating.style.left = `${x}px`;
        floating.style.top = `${y}px`;
        floating.style.opacity = "1";
        reveal(floating, activeRef.current);
      });
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (list.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    const blur = () => close(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  useEffect(() => {
    if (open) reveal(list.current, active);
  }, [open, active]);

  // The first letters of a label jump to it, as in a native select.
  const typing = (at: number) => at - typed.current.at < 700;
  const typeAhead = (key: string, at: number) => {
    const text = (typing(at) ? typed.current.text : "") + key;
    typed.current = { text, at };
    const lower = text.toLowerCase();
    const from = Math.max(active, 0);
    for (let i = 0; i < options.length; i++) {
      const index = (from + (text.length > 1 ? 0 : 1) + i) % options.length;
      if (enabled(index) && options[index]!.label.toLowerCase().startsWith(lower)) {
        return index;
      }
    }
    return -1;
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      show();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const index = typeAhead(event.key, event.timeStamp);
      if (index >= 0) {
        event.preventDefault();
        if (options[index]!.value !== value) onChange(options[index]!.value);
      }
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(step(active, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? step(-1, 1) : step(options.length, -1));
    } else if (
      event.key === "Enter" ||
      (event.key === " " && !typing(event.timeStamp))
    ) {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const index = typeAhead(event.key, event.timeStamp);
      if (index >= 0) setActive(index);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        className={cn("select-trigger", className)}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKeyDown}
      >
        {chosen?.icon}
        <span
          className={cn("select-value", !chosen && "select-placeholder")}
          lang={chosen?.lang}
        >
          {chosen?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown className="select-chevron" aria-hidden />
      </button>
      {open &&
        host &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className={cn("popover select-list", listClassName)}
            style={{ opacity: 0 }}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={cn("select-option", index === active && "select-active")}
                onPointerMove={() => !option.disabled && setActive(index)}
                onClick={() => pick(index)}
              >
                {option.icon}
                <span className="select-label" lang={option.lang}>
                  {option.label}
                </span>
                {option.value === value && (
                  <Check className="select-check" aria-hidden />
                )}
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}

/** Scrolls the list, and only the list, to show an option. */
function reveal(list: HTMLElement | null, index: number) {
  const option = list?.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!list || !option) return;
  const top = option.offsetTop - 4;
  const bottom = option.offsetTop + option.offsetHeight + 4;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}
