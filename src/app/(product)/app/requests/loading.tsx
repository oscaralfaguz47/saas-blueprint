import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function RequestsLoading() {
  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>

        {/* Search + sort bar */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 max-w-md rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>

        {/* Record rows */}
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </Container>
  );
}
