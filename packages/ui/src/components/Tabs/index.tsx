import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clsx } from "clsx";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTabId?: string;
  activeTabId?: string;
  onChange?: (tabId: string) => void;
  "aria-label"?: string;
  className?: string;
}

const tabIdFor = (tabId: string) => `tab-${tabId}`;
const panelIdFor = (tabId: string) => `panel-${tabId}`;

export const Tabs = ({
  tabs,
  defaultTabId,
  activeTabId,
  onChange,
  "aria-label": ariaLabel,
  className,
}: TabsProps) => {
  const firstTabId = tabs[0]?.id;
  const [internalActive, setInternalActive] = useState(defaultTabId ?? firstTabId);
  const activeId = activeTabId ?? internalActive;
  const [focusedTabId, setFocusedTabId] = useState(activeId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusedIndex = Math.max(
    tabs.findIndex((tab) => tab.id === focusedTabId),
    0
  );

  const selectTab = (tabId: string) => {
    if (activeTabId === undefined) {
      setInternalActive(tabId);
    }
    onChange?.(tabId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    let nextIndex: number | null = null;

    if (key === "ArrowRight") {
      nextIndex = (focusedIndex + 1) % tabs.length;
    } else if (key === "ArrowLeft") {
      nextIndex = (focusedIndex - 1 + tabs.length) % tabs.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else if (key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTabId = tabs[nextIndex].id;
    setFocusedTabId(nextTabId);
    selectTab(nextTabId);
    tabRefs.current[nextIndex]?.focus();
  };

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex border-b border-[var(--color-border-default)]"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={tabIdFor(tab.id)}
              aria-selected={isActive}
              aria-controls={panelIdFor(tab.id)}
              tabIndex={tab.id === (focusedTabId ?? activeId) ? 0 : -1}
              onClick={() => {
                setFocusedTabId(tab.id);
                selectTab(tab.id);
              }}
              className={clsx(
                "flex items-center gap-2 border-b-2 px-4 py-2 font-semibold",
                "transition-colors duration-[var(--motion-duration-fast)]",
                isActive
                  ? "border-[var(--color-brand-accent)] text-[var(--color-brand-accent)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab && (
        <div
          role="tabpanel"
          id={panelIdFor(activeTab.id)}
          aria-labelledby={tabIdFor(activeTab.id)}
          className="mt-4"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
};