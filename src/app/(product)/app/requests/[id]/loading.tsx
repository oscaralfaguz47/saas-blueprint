import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function RequestDetailLoading() {
  return (
    <Container>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>

        {/* Title block */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-md" />
          </div>
          <Skeleton className="h-8 w-2/3 rounded" />
          <Skeleton className="h-4 w-48 rounded" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column — main content */}
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          {/* Right column — sidebar */}
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </Container>
  );
}
