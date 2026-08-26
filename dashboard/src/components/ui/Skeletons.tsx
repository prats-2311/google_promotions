function Block({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

function CardBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div>
      <header className="mb-8">
        <Block className="h-3 w-32" />
        <Block className="mt-2 h-9 w-64" />
        <Block className="mt-2 h-4 w-80" />
      </header>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardBlock key={i} className="h-[188px]" />
        ))}
      </div>
    </div>
  );
}

export function CompareCitiesSkeleton() {
  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <Block className="h-3 w-28" />
          <Block className="mt-2 h-9 w-56" />
          <Block className="mt-2 h-4 w-72" />
        </div>
        <Block className="h-9 w-32" />
      </header>
      <CardBlock className="h-[420px]" />
    </div>
  );
}

export function CityDetailSkeleton() {
  return (
    <div>
      <Block className="mb-6 h-4 w-32" />
      <header className="mb-6">
        <Block className="h-3 w-40" />
        <Block className="mt-2 h-10 w-72" />
        <Block className="mt-2 h-4 w-64" />
      </header>
      <Block className="mb-6 h-11 w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardBlock key={i} className="h-[160px]" />
        ))}
      </div>
    </div>
  );
}
