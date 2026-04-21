import * as React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div className={"skeleton-shimmer rounded-md " + className} {...props} />
  );
}

export { Skeleton };
