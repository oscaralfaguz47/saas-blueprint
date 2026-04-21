import * as React from "react";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className = "", ...props }, ref) => (
    <div className="w-full overflow-auto rounded-xl border border-(--border-subtle)">
      <table ref={ref} className={"w-full caption-bottom text-sm " + className} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => (
  <thead ref={ref} className={"bg-(--bg-surface-elev) [&_tr]:border-b " + className} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => (
  <tbody ref={ref} className={"[&_tr:last-child]:border-0 " + className} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className = "", ...props }, ref) => (
    <tr
      ref={ref}
      className={
        "border-b border-(--border-subtle) " +
        "transition-colors duration-150 " +
        "hover:bg-(--bg-surface-elev) " +
        className
      }
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = "", ...props }, ref) => (
  <th
    ref={ref}
    className={
      "h-11 px-4 text-left align-middle " +
      "text-[11px] font-semibold uppercase " +
      "tracking-widest text-(--text-muted) " +
      "whitespace-nowrap " +
      "[&:has([role=checkbox])]:pr-0 " +
      className
    }
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className = "", ...props }, ref) => (
  <td
    ref={ref}
    className={
      "px-4 py-3.5 align-middle text-sm " +
      "text-(--text-primary) " +
      "[&:has([role=checkbox])]:pr-0 " +
      className
    }
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
