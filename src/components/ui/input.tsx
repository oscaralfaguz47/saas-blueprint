import * as React from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={
          "flex h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:pointer-events-none disabled:opacity-60 " +
          className
        }
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
