import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Keyboard, Command } from "lucide-react";

/**
 * Keyboard Shortcuts Dialog
 * Shows all available keyboard shortcuts in the app
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }) {
  const shortcuts = [
    { category: "Navigation", items: [
      { keys: ["Ctrl", "K"], description: "Ouvrir la recherche globale" },
      { keys: ["Esc"], description: "Fermer les dialogues/modals" },
    ]},
    { category: "Actions rapides", items: [
      { keys: ["Ctrl", "S"], description: "Sauvegarder (dans les formulaires)" },
      { keys: ["Ctrl", "Enter"], description: "Soumettre le formulaire" },
    ]},
    { category: "Tables", items: [
      { keys: ["↑", "↓"], description: "Naviguer dans les lignes" },
      { keys: ["Enter"], description: "Ouvrir les détails" },
    ]},
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Raccourcis clavier
          </DialogTitle>
          <DialogDescription>
            Utilisez ces raccourcis pour naviguer plus rapidement
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {group.category}
              </h4>
              <div className="space-y-2">
                {group.items.map((shortcut, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={keyIdx}>
                          {keyIdx > 0 && <span className="text-gray-400 text-xs">+</span>}
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded shadow-sm">
                            {key === "Ctrl" ? (
                              <span className="flex items-center gap-0.5">
                                <Command className="h-3 w-3" />
                              </span>
                            ) : key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-center text-gray-500">
            Appuyez sur <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 rounded border">?</kbd> n'importe où pour afficher ce dialogue
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
