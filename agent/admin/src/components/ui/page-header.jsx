import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * PageHeader - Consistent header component for all admin pages
 * Includes title, description, breadcrumbs, and action buttons
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  breadcrumbs = [],
  children,
  className,
}) {
  return (
    <div className={cn("mb-6", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center text-sm text-muted-foreground mb-3">
          <Link to="/" className="hover:text-foreground transition-colors">
            <Home className="h-4 w-4" />
          </Link>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="h-4 w-4 mx-2" />
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Header Content */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {children && (
          <div className="flex items-center gap-2 flex-wrap">{children}</div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
