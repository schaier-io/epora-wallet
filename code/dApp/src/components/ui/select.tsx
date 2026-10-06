import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { fieldChrome, fieldHeight } from "@/components/ui/field-styles";

/**
 * A native `<Select>` wearing the same chrome as `Input` and `Textarea`.
 *
 * There were 18 native selects across four hand-written class strings. Four of them
 * omitted the focus ring entirely and fell back to the browser's default outline while
 * the input beside them drew the app ring, and one sat at 32px in a 40px row. The
 * `aria-[invalid=true]` rule matches `Input`, so a rejected select gets the rose border
 * for free once something sets the attribute.
 *
 * The UA arrow is replaced by a drawn chevron in `form-controls.css`. The native one
 * sat flush against the border with no padding of its own, so the select read as a
 * different control from the input beside it.
 *
 * Native on purpose: the platform control is keyboard- and screen-reader-correct out of
 * the box, and on touch it opens the OS picker. A custom listbox would have to re-earn
 * all of that.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => {
  return (
    <select
      className={cn(
        fieldChrome,
        fieldHeight,
        // `pr-*` is not set here: `form-controls.css` draws the chevron and reserves its
        // room outside the utility layer, so a caller's `px-2` cannot squeeze it.
        "flex px-3 py-2 enabled:cursor-pointer",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Select.displayName = "Select";

export { Select };
