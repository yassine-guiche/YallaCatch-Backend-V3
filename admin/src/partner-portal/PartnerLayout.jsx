import { Link, useLocation } from 'react-router-dom';
import { LogOut, Store, ShoppingBag, QrCode } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function PartnerLayout({ children }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Tableau de bord', to: '/partner-portal', icon: QrCode },
    { label: 'Marketplace', to: '/partner/marketplace', icon: Store },
    { label: 'Validations', to: '/partner-redemptions', icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-100 text-slate-900">
      <header className="border-b bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              Y!
            </div>
            <div>
              <div className="text-lg font-semibold">Portail Partenaire</div>
              <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-slate-200 hover:border-amber-400 hover:text-amber-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Se dÇ¸connecter
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <nav className="bg-white rounded-xl shadow-sm border border-amber-100 p-3 space-y-2">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'text-slate-700 hover:bg-amber-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="bg-white rounded-xl shadow-sm border border-amber-100 p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
