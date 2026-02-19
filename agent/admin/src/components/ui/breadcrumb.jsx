import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const breadcrumbVariants = cva(
  "inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground",
  {
    variants: {
      variant: {
        default: "",
        active: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Breadcrumb = React.forwardRef(({ ...props }, ref) => (
  <nav ref={ref} aria-label="breadcrumb" {...props} />
))
Breadcrumb.displayName = "Breadcrumb"

const BreadcrumbList = React.forwardRef(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5",
      className
    )}
    {...props}
  />
))
BreadcrumbList.displayName = "BreadcrumbList"

const BreadcrumbItem = React.forwardRef(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn("inline-flex items-center gap-1.5", className)}
    {...props}
  />
))
BreadcrumbItem.displayName = "BreadcrumbItem"

const BreadcrumbLink = React.forwardRef(({ className, variant, ...props }, ref) => (
  <a
    ref={ref}
    className={cn(breadcrumbVariants({ variant }), className)}
    {...props}
  />
))
BreadcrumbLink.displayName = "BreadcrumbLink"

const BreadcrumbSeparator = ({ children, className, ...props }) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("[&>svg]:size-3.5", className)}
    {...props}
  >
    {children ?? (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM6.1584 3.13508L6.1584 3.13508L6.1584 3.13508ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008ZM3.409 7.50008L3.40894 7.50008L3.40894 7.50008L3.409 7.50008Z"
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
        ></path>
      </svg>
    )}
  </li>
)
BreadcrumbSeparator.displayName = "BreadcrumbSeparator"

const BreadcrumbEllipsis = ({ className, ...props }) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.5 7.5C3.5 8.05228 3.05228 8.5 2.5 8.5C1.94772 8.5 1.5 8.05228 1.5 7.5C1.5 6.94772 1.94772 6.5 2.5 6.5C3.05228 6.5 3.5 6.94772 3.5 7.5ZM8.5 7.5C8.5 8.05228 8.05228 8.5 7.5 8.5C6.94772 8.5 6.5 8.05228 6.5 7.5C6.5 6.94772 6.94772 6.5 7.5 6.5C8.05228 6.5 8.5 6.94772 8.5 7.5ZM12.5 8.5C13.0523 8.5 13.5 8.05228 13.5 7.5C13.5 6.94772 13.0523 6.5 12.5 6.5C11.9477 6.5 11.5 6.94772 11.5 7.5C11.5 8.05228 11.9477 8.5 12.5 8.5Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      ></path>
    </svg>
    <span className="sr-only">More</span>
  </span>
)
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis"

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}