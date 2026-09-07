// Source: https://21st.dev/@preetsuthar17/components/task-filters
// install: npx shadcn@latest add "https://21st.dev/r/preetsuthar17/task-filters"
// Card-based filter panel: search input, toggle-button groups for status/priority, Select dropdowns
// for assignees/projects with removable Badge chips, date-range inputs, live "N active filters" +
// Clear All. Pure shadcn primitives (Card/Button/Badge/Select/InputGroup/Separator) — no custom CSS.

"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface TaskFilter {
  status?: string[];
  priority?: string[];
  assigneeIds?: string[];
  dueDateRange?: { start?: Date; end?: Date };
  tags?: string[];
  projectIds?: string[];
  search?: string;
}

export default function TaskFilters({
  onFilterChange,
  availableAssignees = [],
  availableProjects = [],
  className,
}: {
  onFilterChange?: (filter: TaskFilter) => void;
  availableAssignees?: Array<{ id: string; name: string }>;
  availableProjects?: Array<{ id: string; name: string }>;
  availableTags?: string[];
  className?: string;
  showSavedFilters?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);

  const activeFilters = useMemo(
    () =>
      (status.length > 0 ? 1 : 0) +
      (priority.length > 0 ? 1 : 0) +
      (assignees.length > 0 ? 1 : 0) +
      (projects.length > 0 ? 1 : 0) +
      (search.trim() ? 1 : 0),
    [status, priority, assignees, projects, search],
  );

  const toggle = <T,>(arr: T[], item: T, setter: (v: T[]) => void) =>
    arr.includes(item) ? setter(arr.filter((i) => i !== item)) : setter([...arr, item]);

  return (
    <Card className={cn("w-full shadow-xs", className)}>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>
          {activeFilters > 0 ? `${activeFilters} active filter${activeFilters !== 1 ? "s" : ""}` : "No active filters"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <InputGroup>
            <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
            <InputGroupInput
              onChange={(e) => { setSearch(e.target.value); onFilterChange?.({ search: e.target.value }); }}
              placeholder="Search tasks…"
              type="search"
              value={search}
            />
          </InputGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-muted-foreground text-sm">Status</label>
              <div className="flex flex-wrap gap-2">
                {["todo", "in_progress", "done", "cancelled"].map((s) => (
                  <Button key={s} onClick={() => toggle(status, s, setStatus)} size="sm" type="button"
                    variant={status.includes(s) ? "default" : "outline"}>
                    {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-muted-foreground text-sm">Priority</label>
              <div className="flex flex-wrap gap-2">
                {["low", "medium", "high", "urgent"].map((p) => (
                  <Button key={p} onClick={() => toggle(priority, p, setPriority)} size="sm" type="button"
                    variant={priority.includes(p) ? "default" : "outline"}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {availableAssignees.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-muted-foreground text-sm">Assignees</label>
              <Select onValueChange={(v) => toggle(assignees, v, setAssignees)} value="">
                <SelectTrigger><SelectValue placeholder="Select assignees" /></SelectTrigger>
                <SelectContent>
                  {availableAssignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {assignees.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {assignees.map((id) => {
                    const a = availableAssignees.find((x) => x.id === id);
                    return a ? (
                      <Badge className="flex items-center gap-1" key={id} variant="secondary">
                        {a.name}
                        <button onClick={() => setAssignees(assignees.filter((x) => x !== id))} type="button">
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {activeFilters > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{activeFilters} active filter{activeFilters !== 1 ? "s" : ""}</span>
                <Button onClick={() => { setSearch(""); setStatus([]); setPriority([]); setAssignees([]); setProjects([]); onFilterChange?.({}); }} size="sm" type="button" variant="outline">
                  <X className="size-4" /> Clear All
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
