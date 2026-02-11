import * as React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={
        "animate-pulse rounded-md bg-(--bg-surface-elev) " + className
      }
      {...props}
    />
  );
}

export { Skeleton };
