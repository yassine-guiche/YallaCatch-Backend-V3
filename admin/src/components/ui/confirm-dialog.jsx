import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2, Ban, Check, Info, X } from "lucide-react";

/**
 * ConfirmDialog - Reusable confirmation dialog with variants
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Confirmer l'action",
  description = "Êtes-vous sûr de vouloir continuer ?",
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
  variant = "default", // default, danger, warning, success
  loading = false,
  icon: CustomIcon,
}) {
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange?.(false);
  };

  // Get variant-specific styles
  const getVariantConfig = () => {
    switch (variant) {
      case "danger":
        return {
          icon: Trash2,
          iconBg: "bg-red-100",
          iconColor: "text-red-600",
          buttonClass: "bg-red-600 hover:bg-red-700 focus:ring-red-600",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          iconBg: "bg-orange-100",
          iconColor: "text-orange-600",
          buttonClass: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-600",
        };
      case "success":
        return {
          icon: Check,
          iconBg: "bg-green-100",
          iconColor: "text-green-600",
          buttonClass: "bg-green-600 hover:bg-green-700 focus:ring-green-600",
        };
      case "ban":
        return {
          icon: Ban,
          iconBg: "bg-red-100",
          iconColor: "text-red-600",
          buttonClass: "bg-red-600 hover:bg-red-700 focus:ring-red-600",
        };
      default:
        return {
          icon: Info,
          iconBg: "bg-blue-100",
          iconColor: "text-blue-600",
          buttonClass: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",
        };
    }
  };

  const config = getVariantConfig();
  const Icon = CustomIcon || config.icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-full", config.iconBg)}>
              <Icon className={cn("h-6 w-6", config.iconColor)} />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg font-semibold">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={loading}
            className="mr-2"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "text-white",
              config.buttonClass,
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Chargement...
              </span>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * DeleteConfirmDialog - Pre-configured delete confirmation
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName = "cet élément",
  onConfirm,
  loading,
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="danger"
      title="Supprimer"
      description={`Êtes-vous sûr de vouloir supprimer ${itemName} ? Cette action est irréversible.`}
      confirmLabel="Supprimer"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}

/**
 * BanConfirmDialog - Pre-configured ban confirmation
 */
export function BanConfirmDialog({
  open,
  onOpenChange,
  userName = "cet utilisateur",
  onConfirm,
  loading,
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="ban"
      title="Bannir l'utilisateur"
      description={`Êtes-vous sûr de vouloir bannir ${userName} ? L'utilisateur ne pourra plus accéder à la plateforme.`}
      confirmLabel="Bannir"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}

export default ConfirmDialog;
