import * as React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={
          "flex min-h-[80px] w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:pointer-events-none disabled:opacity-60 " +
          className
        }
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
