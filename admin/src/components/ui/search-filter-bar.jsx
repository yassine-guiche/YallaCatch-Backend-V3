import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Button } from "./button";
import { Badge } from "./badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Search, X, Filter, Download, RefreshCw, SlidersHorizontal } from "lucide-react";

/**
 * SearchFilterBar - Consistent search and filter UI component
 */
export function SearchFilterBar({
  // Search props
  searchPlaceholder = "Rechercher...",
  searchValue = "",
  onSearchChange,
  
  // Filter props
  filters = [], // Array of { key, label, options: [{ value, label }], value, onChange }
  
  // Actions
  onRefresh,
  onExport,
  showRefresh = true,
  showExport = false,
  refreshLoading = false,
  
  // Active filters display
  showActiveFilters = true,
  
  // Additional actions (buttons)
  children,
  
  className,
}) {
  const [showFilters, setShowFilters] = React.useState(false);
  
  // Count active filters
  const activeFilterCount = filters.filter(
    (f) => f.value && f.value !== "all" && f.value !== ""
  ).length;

  // Clear all filters
  const clearAllFilters = () => {
    filters.forEach((filter) => {
      if (filter.onChange) {
        filter.onChange("all");
      }
    });
    if (onSearchChange) {
      onSearchChange("");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange?.("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Inline filters (for desktop) */}
        <div className="hidden md:flex items-center gap-2">
          {filters.slice(0, 3).map((filter) => (
            <Select
              key={filter.key}
              value={filter.value || "all"}
              onValueChange={filter.onChange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {filter.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>

        {/* Filter toggle button (for mobile or many filters) */}
        {(filters.length > 3 || true) && (
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {showRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={refreshLoading}
              title="Actualiser"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshLoading && "animate-spin")}
              />
            </Button>
          )}
          
          {showExport && (
            <Button
              variant="outline"
              size="icon"
              onClick={onExport}
              title="Exporter"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          
          {children}
        </div>
      </div>

      {/* Mobile filters (collapsed) */}
      {showFilters && (
        <div className="md:hidden flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={filter.value || "all"}
              onValueChange={filter.onChange}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous - {filter.label}</SelectItem>
                {filter.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}

      {/* Active filters display */}
      {showActiveFilters && (activeFilterCount > 0 || searchValue) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtres actifs:</span>
          
          {searchValue && (
            <Badge variant="secondary" className="gap-1">
              Recherche: "{searchValue}"
              <button onClick={() => onSearchChange?.("")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          
          {filters
            .filter((f) => f.value && f.value !== "all" && f.value !== "")
            .map((filter) => {
              const selectedOption = filter.options?.find(
                (opt) => opt.value === filter.value
              );
              return (
                <Badge key={filter.key} variant="secondary" className="gap-1">
                  {filter.label}: {selectedOption?.label || filter.value}
                  <button onClick={() => filter.onChange?.("all")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={clearAllFilters}
          >
            Effacer tout
          </Button>
        </div>
      )}
    </div>
  );
}

export default SearchFilterBar;
