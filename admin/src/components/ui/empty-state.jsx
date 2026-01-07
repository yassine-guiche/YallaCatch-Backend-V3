import * as React from "react";
import { cn } from "@/lib/utils";
import { 
  Inbox, 
  Search, 
  Plus, 
  RefreshCw,
  AlertCircle,
  WifiOff,
  FileX,
  Users,
  Trophy,
  Gift,
  ShoppingBag,
  Bell,
  Settings,
  Zap
} from "lucide-react";
import { Button } from "./button";

/**
 * EmptyState - Helpful empty state with context-aware icons and actions
 */
export function EmptyState({
  icon: CustomIcon,
  title = "Aucune donnée",
  description = "Il n'y a rien à afficher pour le moment.",
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  variant = "default", // default, search, error, offline
  className,
}) {
  // Select icon based on variant
  const getIcon = () => {
    if (CustomIcon) return CustomIcon;
    switch (variant) {
      case "search":
        return Search;
      case "error":
        return AlertCircle;
      case "offline":
        return WifiOff;
      case "empty":
        return FileX;
      default:
        return Inbox;
    }
  };

  const Icon = getIcon();

  // Get variant-specific styles
  const getVariantStyles = () => {
    switch (variant) {
      case "error":
        return "bg-red-50 text-red-400";
      case "offline":
        return "bg-orange-50 text-orange-400";
      case "search":
        return "bg-blue-50 text-blue-400";
      default:
        return "bg-gray-100 text-gray-400";
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className={cn("p-4 rounded-full mb-4", getVariantStyles())}>
        <Icon className="h-10 w-10" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      
      <div className="flex items-center gap-3">
        {actionLabel && onAction && (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <Button variant="outline" onClick={onSecondaryAction} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {secondaryActionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * SearchEmptyState - When search yields no results
 */
export function SearchEmptyState({ searchTerm, onClear, className }) {
  return (
    <EmptyState
      variant="search"
      title="Aucun résultat"
      description={`Aucun élément trouvé pour "${searchTerm}". Essayez avec d'autres termes ou effacez la recherche.`}
      actionLabel="Effacer la recherche"
      onAction={onClear}
      className={className}
    />
  );
}

/**
 * ErrorState - When an error occurs
 */
export function ErrorState({ 
  message = "Une erreur est survenue", 
  onRetry,
  className 
}) {
  return (
    <EmptyState
      variant="error"
      title="Erreur"
      description={message}
      actionLabel="Réessayer"
      onAction={onRetry}
      className={className}
    />
  );
}

/**
 * OfflineState - When connection is lost
 */
export function OfflineState({ onRetry, className }) {
  return (
    <EmptyState
      variant="offline"
      title="Hors ligne"
      description="Vérifiez votre connexion internet et réessayez."
      actionLabel="Réessayer"
      onAction={onRetry}
      className={className}
    />
  );
}

/**
 * Context-specific empty states
 */
export const emptyStatePresets = {
  users: {
    icon: Users,
    title: "Aucun utilisateur",
    description: "Les utilisateurs apparaîtront ici une fois inscrits sur la plateforme.",
  },
  prizes: {
    icon: Trophy,
    title: "Aucun prix",
    description: "Créez votre premier prix pour commencer à engager vos joueurs.",
    actionLabel: "Créer un prix",
  },
  rewards: {
    icon: Gift,
    title: "Aucune récompense",
    description: "Ajoutez des récompenses que les joueurs peuvent échanger contre leurs points.",
    actionLabel: "Ajouter une récompense",
  },
  marketplace: {
    icon: ShoppingBag,
    title: "Marketplace vide",
    description: "Ajoutez des articles à la marketplace pour permettre aux joueurs de faire des achats.",
    actionLabel: "Ajouter un article",
  },
  notifications: {
    icon: Bell,
    title: "Aucune notification",
    description: "Envoyez des notifications pour communiquer avec vos utilisateurs.",
    actionLabel: "Envoyer une notification",
  },
  powerups: {
    icon: Zap,
    title: "Aucun power-up",
    description: "Créez des power-ups pour rendre le jeu plus excitant.",
    actionLabel: "Créer un power-up",
  },
};

export default EmptyState;
