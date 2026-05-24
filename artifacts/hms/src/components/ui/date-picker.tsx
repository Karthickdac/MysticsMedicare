import * as React from "react";
import { format, parse, isValid } from "date-fns";
import type { Matcher } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: Matcher | Matcher[];
  placeholder?: string;
  minDate?: Date;
  className?: string;
  id?: string;
  ariaLabel?: string;
};

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  minDate,
  className,
  id,
  ariaLabel,
}: Props) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  const matchers: Matcher[] = React.useMemo(() => {
    const arr: Matcher[] = [];
    if (disabled) arr.push(...(Array.isArray(disabled) ? disabled : [disabled]));
    if (minDate) arr.push({ before: minDate });
    return arr;
  }, [disabled, minDate]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          disabled={matchers.length ? matchers : undefined}
          defaultMonth={selected ?? minDate ?? new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
