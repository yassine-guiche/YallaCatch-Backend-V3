import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TableSkeleton - Loading skeleton for tables
 */
export function TableSkeleton({ rows = 5, columns = 5, className }) {
  return (
    <div className={cn("w-full", className)}>
      {/* Header skeleton */}
      <div className="flex items-center gap-4 p-4 border-b bg-gray-50">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`header-${i}`}
            className="h-4 bg-gray-200 rounded animate-pulse"
            style={{ width: `${Math.random() * 30 + 10}%` }}
          />
        ))}
      </div>
      
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="flex items-center gap-4 p-4 border-b"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={`cell-${rowIndex}-${colIndex}`}
              className="h-4 bg-gray-100 rounded animate-pulse"
              style={{ 
                width: `${Math.random() * 30 + 10}%`,
                animationDelay: `${rowIndex * 100}ms`
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * CardSkeleton - Loading skeleton for cards
 */
export function CardSkeleton({ className }) {
  return (
    <div className={cn("rounded-xl border bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
          <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-40" />
        </div>
        <div className="h-10 w-10 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

/**
 * StatCardsSkeleton - Loading skeleton for stats row
 */
export function StatCardsSkeleton({ count = 4, className }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * ListSkeleton - Loading skeleton for lists
 */
export function ListSkeleton({ items = 5, showAvatar = true, className }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {showAvatar && (
            <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
          )}
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * FormSkeleton - Loading skeleton for forms
 */
export function FormSkeleton({ fields = 4, className }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
          <div className="h-10 bg-gray-50 border rounded-md animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/**
 * ChartSkeleton - Loading skeleton for charts
 */
export function ChartSkeleton({ height = 300, className }) {
  return (
    <div
      className={cn("rounded-xl border bg-white p-4", className)}
      style={{ height }}
    >
      <div className="h-4 bg-gray-100 rounded animate-pulse w-32 mb-4" />
      <div className="flex items-end justify-between h-[calc(100%-2rem)] gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-100 rounded-t animate-pulse"
            style={{
              height: `${Math.random() * 60 + 20}%`,
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * PageSkeleton - Full page loading skeleton
 */
export function PageSkeleton({ className }) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-48" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-64" />
        </div>
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse w-32" />
      </div>

      {/* Stats */}
      <StatCardsSkeleton />

      {/* Content */}
      <div className="rounded-xl border bg-white">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded animate-pulse w-32" />
          <div className="h-10 bg-gray-100 rounded animate-pulse w-48" />
        </div>
        <TableSkeleton rows={8} columns={6} />
      </div>
    </div>
  );
}

export {
  TableSkeleton as default,
};
