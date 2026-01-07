import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StatCard - Improved statistics card with animations and trends
 */
export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = "blue",
  loading = false,
  className,
  onClick,
}) {
  const colorClasses = {
    blue: {
      bg: "bg-blue-50",
      icon: "text-blue-600",
      gradient: "from-blue-500 to-blue-600",
    },
    green: {
      bg: "bg-emerald-50",
      icon: "text-emerald-600",
      gradient: "from-emerald-500 to-emerald-600",
    },
    purple: {
      bg: "bg-purple-50",
      icon: "text-purple-600",
      gradient: "from-purple-500 to-purple-600",
    },
    orange: {
      bg: "bg-orange-50",
      icon: "text-orange-600",
      gradient: "from-orange-500 to-orange-600",
    },
    pink: {
      bg: "bg-pink-50",
      icon: "text-pink-600",
      gradient: "from-pink-500 to-pink-600",
    },
    red: {
      bg: "bg-red-50",
      icon: "text-red-600",
      gradient: "from-red-500 to-red-600",
    },
    indigo: {
      bg: "bg-indigo-50",
      icon: "text-indigo-600",
      gradient: "from-indigo-500 to-indigo-600",
    },
    cyan: {
      bg: "bg-cyan-50",
      icon: "text-cyan-600",
      gradient: "from-cyan-500 to-cyan-600",
    },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white p-5 shadow-sm transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:border-gray-300",
        className
      )}
      onClick={onClick}
    >
      {/* Background gradient decoration */}
      <div
        className={cn(
          "absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-10 bg-gradient-to-br",
          colors.gradient
        )}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 bg-gray-200 animate-pulse rounded w-24" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-32" />
            </div>
          ) : (
            <>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">
                {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
              </p>
              
              <div className="flex items-center gap-2 mt-1.5">
                {subtitle && (
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                )}
                
                {trend && trendValue && (
                  <span
                    className={cn(
                      "inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full",
                      trend === "up"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    )}
                  >
                    {trend === "up" ? "↑" : "↓"} {trendValue}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {Icon && (
          <div className={cn("p-2.5 rounded-xl", colors.bg)}>
            <Icon className={cn("h-5 w-5", colors.icon)} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * StatsGrid - Grid container for StatCards
 */
export function StatsGrid({ children, columns = 4, className }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        columns === 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export default StatCard;
