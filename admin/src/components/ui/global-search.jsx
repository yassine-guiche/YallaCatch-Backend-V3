import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./dialog";
import { Input } from "./input";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import {
  Search,
  Users,
  Trophy,
  Gift,
  MapPin,
  Settings,
  BarChart3,
  ShoppingBag,
  Bell,
  FileText,
  Zap,
  Command,
  ArrowRight,
  Clock,
} from "lucide-react";

/**
 * Search categories with their routes and icons
 */
const SEARCH_CATEGORIES = [
  { 
    id: 'users', 
    label: 'Utilisateurs', 
    path: '/users', 
    icon: Users,
    description: 'Gérer les utilisateurs',
    keywords: ['user', 'utilisateur', 'joueur', 'player', 'compte', 'profil']
  },
  { 
    id: 'prizes', 
    label: 'Prix & Distribution', 
    path: '/prizes', 
    icon: Trophy,
    description: 'Distribuer des prix',
    keywords: ['prix', 'prize', 'distribution', 'cadeau', 'lot']
  },
  { 
    id: 'rewards', 
    label: 'Récompenses', 
    path: '/rewards', 
    icon: Gift,
    description: 'Catalogue des récompenses',
    keywords: ['reward', 'récompense', 'bonus', 'point']
  },
  { 
    id: 'partners', 
    label: 'Partenaires', 
    path: '/partners', 
    icon: MapPin,
    description: 'Points de retrait',
    keywords: ['partner', 'partenaire', 'magasin', 'shop', 'retrait']
  },
  { 
    id: 'marketplace', 
    label: 'Marketplace', 
    path: '/marketplace', 
    icon: ShoppingBag,
    description: 'Boutique en ligne',
    keywords: ['marketplace', 'boutique', 'shop', 'achat', 'vente']
  },
  { 
    id: 'analytics', 
    label: 'Analytics', 
    path: '/analytics', 
    icon: BarChart3,
    description: 'Statistiques et rapports',
    keywords: ['analytics', 'statistique', 'rapport', 'chart', 'graph']
  },
  { 
    id: 'notifications', 
    label: 'Notifications', 
    path: '/notifications', 
    icon: Bell,
    description: 'Envoyer des notifications',
    keywords: ['notification', 'push', 'message', 'alert']
  },
  { 
    id: 'reports', 
    label: 'Signalements', 
    path: '/reports', 
    icon: FileText,
    description: 'Modération et signalements',
    keywords: ['report', 'signalement', 'moderation', 'abuse']
  },
  { 
    id: 'powerups', 
    label: 'Power-ups', 
    path: '/power-ups', 
    icon: Zap,
    description: 'Boosts et power-ups',
    keywords: ['powerup', 'power-up', 'boost', 'bonus']
  },
  { 
    id: 'settings', 
    label: 'Paramètres', 
    path: '/settings', 
    icon: Settings,
    description: 'Configuration système',
    keywords: ['settings', 'paramètre', 'config', 'configuration']
  },
];

/**
 * GlobalSearch - Command palette style global search
 */
export function GlobalSearch({ open, onOpenChange }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('yc-recent-searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load recent searches:', e);
      }
    }
  }, []);

  // Filter categories based on query
  const filteredCategories = query.trim() === '' 
    ? SEARCH_CATEGORIES 
    : SEARCH_CATEGORIES.filter(cat => 
        cat.label.toLowerCase().includes(query.toLowerCase()) ||
        cat.description.toLowerCase().includes(query.toLowerCase()) ||
        cat.keywords.some(k => k.toLowerCase().includes(query.toLowerCase()))
      );

  // Handle navigation
  const handleSelect = useCallback((category) => {
    // Save to recent searches
    const updated = [
      category.id, 
      ...recentSearches.filter(id => id !== category.id)
    ].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('yc-recent-searches', JSON.stringify(updated));
    
    // Navigate
    navigate(category.path);
    onOpenChange(false);
    setQuery('');
  }, [navigate, onOpenChange, recentSearches]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCategories.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCategories[selectedIndex]) {
          handleSelect(filteredCategories[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredCategories, selectedIndex, handleSelect]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Get recent items
  const recentItems = recentSearches
    .map(id => SEARCH_CATEGORIES.find(c => c.id === id))
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-lg overflow-hidden">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        
        {/* Search input */}
        <div className="flex items-center border-b px-4">
          <Search className="h-5 w-5 text-gray-400 mr-3" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une page, fonctionnalité..."
            className="border-0 focus-visible:ring-0 text-base py-4 px-0"
          />
          <Badge variant="outline" className="text-xs ml-2">
            <Command className="h-3 w-3 mr-1" />K
          </Badge>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Recent searches */}
          {query.trim() === '' && recentItems.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Récent
              </div>
              {recentItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      "hover:bg-gray-100 focus:outline-none",
                    )}
                  >
                    <div className="p-2 rounded-lg bg-gray-100">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                  </button>
                );
              })}
              <div className="border-t my-2" />
            </div>
          )}

          {/* Search results */}
          <div className="px-2 py-2">
            {query.trim() !== '' && (
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                Résultats
              </div>
            )}
            
            {filteredCategories.length === 0 ? (
              <div className="px-3 py-8 text-center text-gray-500">
                <Search className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm">Aucun résultat pour "{query}"</p>
              </div>
            ) : (
              filteredCategories.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                      isSelected 
                        ? "bg-blue-50 text-blue-900" 
                        : "hover:bg-gray-100"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected ? "bg-blue-100" : "bg-gray-100"
                    )}>
                      <Icon className={cn(
                        "h-4 w-4",
                        isSelected ? "text-blue-600" : "text-gray-600"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-blue-900" : "text-gray-900"
                      )}>
                        {item.label}
                      </p>
                      <p className={cn(
                        "text-xs",
                        isSelected ? "text-blue-600" : "text-gray-500"
                      )}>
                        {item.description}
                      </p>
                    </div>
                    {isSelected && (
                      <ArrowRight className="h-4 w-4 text-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">↵</kbd>
              sélectionner
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">esc</kbd>
            fermer
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GlobalSearch;
