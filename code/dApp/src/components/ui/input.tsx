import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { fieldChrome, fieldHeight } from "@/components/ui/field-styles";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          fieldChrome,
          fieldHeight,
          "flex px-3 py-2",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
