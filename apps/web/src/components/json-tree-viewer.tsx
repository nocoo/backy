import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function getTypeLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    return `Object(${Object.keys(value as Record<string, unknown>).length})`;
  }
  return typeof value;
}

function getValueColorClass(value: unknown): string {
  if (value === null) return "text-muted-foreground italic";
  if (typeof value === "string") return "text-success";
  if (typeof value === "number") return "text-info";
  if (typeof value === "boolean") return "text-warning";
  return "text-foreground";
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (value.length > 200) return `"${value.slice(0, 200)}…"`;
    return `"${value}"`;
  }
  return String(value);
}

function isExpandable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

interface TreeNodeProps {
  label: string;
  value: unknown;
  depth: number;
  defaultExpanded?: boolean | undefined;
}

function TreeNode({ label, value, depth, defaultExpanded }: TreeNodeProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? depth < 1);
  const expandable = isExpandable(value);

  const entries: [string, unknown][] = expandable
    ? Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>)
    : [];

  return (
    <div className="select-text">
      <button
        type="button"
        onClick={() => expandable && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-mono text-sm",
          "hover:bg-accent/60 transition-colors",
          !expandable && "cursor-default",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <span className="w-4 h-4 shrink-0 flex items-center justify-center">
          {expandable ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          )}
        </span>

        <span className="text-foreground font-medium shrink-0">{label}</span>
        <span className="text-muted-foreground shrink-0">:</span>

        {expandable ? (
          <span className="text-muted-foreground text-xs ml-1">
            {getTypeLabel(value)}
          </span>
        ) : (
          <span className={cn("ml-1 truncate", getValueColorClass(value))}>
            {formatValue(value)}
          </span>
        )}
      </button>

      {expandable && expanded && (
        <div>
          {entries.map(([key, val]) => (
            <TreeNode key={key} label={key} value={val} depth={depth + 1} />
          ))}
          {entries.length === 0 && (
            <div
              className="text-muted-foreground text-xs italic py-0.5 px-1 font-mono"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
            >
              {Array.isArray(value) ? "empty array" : "empty object"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface JsonTreeViewerProps {
  data: unknown;
  className?: string | undefined;
}

export function JsonTreeViewer({ data, className }: JsonTreeViewerProps) {
  if (!isExpandable(data)) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-secondary p-4 font-mono text-sm",
          className,
        )}
      >
        <span className={getValueColorClass(data)}>{formatValue(data)}</span>
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(data)
    ? data.map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>);

  return (
    <div
      className={cn(
        "rounded-lg border bg-secondary p-2 overflow-auto max-h-[70vh]",
        className,
      )}
    >
      <div className="text-xs text-muted-foreground mb-1 px-1 font-mono">
        {getTypeLabel(data)}
      </div>

      {entries.map(([key, val]) => (
        <TreeNode
          key={key}
          label={key}
          value={val}
          depth={0}
          defaultExpanded
        />
      ))}

      {entries.length === 0 && (
        <div className="text-muted-foreground text-sm italic p-2 font-mono">
          {Array.isArray(data) ? "Empty array" : "Empty object"}
        </div>
      )}
    </div>
  );
}
