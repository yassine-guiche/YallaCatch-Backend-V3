import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { GlobalSearch } from '../components/ui/global-search';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { KeyboardShortcutsDialog } from '../components/ui/keyboard-shortcuts-dialog';
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  Gift, 
  CreditCard, 
  BarChart3, 
  Bell, 
  Settings, 
  LogOut,
  Menu,
  X,
  User,
  Home,
  Award,
  ShoppingBag,
  MessageSquare,
  Shield,
  Palette,
  HelpCircle,
  Video,
  Zap,
  FlaskConical,
  Gamepad2,
  Heart,
  QrCode,
  ChevronDown,
  ChevronRight,
  Search,
  Command,
  Keyboard
} from 'lucide-react';

// Menu groups for better organization
const menuGroups = [
  {
    id: 'main',
    label: null, // No label for main section
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Tableau de Bord', permission: null },
      { path: '/game-monitoring', icon: Gamepad2, label: 'Monitoring Jeu', permission: 'analytics' },
    ]
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    items: [
      { path: '/users', icon: Users, label: 'Gestion Utilisateurs', permission: 'users' },
      { path: '/friendships', icon: Heart, label: 'Amitiés', permission: 'users' },
    ]
  },
  {
    id: 'game',
    label: 'Jeu & Récompenses',
    items: [
      { path: '/prizes', icon: Trophy, label: 'Prix & Distribution', permission: 'prizes' },
      { path: '/rewards', icon: Gift, label: 'Récompenses', permission: 'rewards' },
      { path: '/claims', icon: CreditCard, label: 'Réclamations', permission: 'claims' },
      { path: '/power-ups', icon: Zap, label: 'Power-Ups', permission: 'gamification' },
      { path: '/achievements', icon: Award, label: 'Achievements', permission: 'gamification' },
    ]
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { path: '/marketplace', icon: ShoppingBag, label: 'Marketplace', permission: 'marketplace' },
      { path: '/partners', icon: Home, label: 'Partenaires', permission: 'partners' },
      { path: '/promo-codes', icon: Gift, label: 'Codes Promo', permission: 'marketing' },
    ]
  },
  {
    id: 'partner',
    label: 'Portail Partenaire',
      items: [
        { path: '/partner-portal', icon: QrCode, label: 'Dashboard Partenaire', permission: 'partner_portal', roles: ['partner'] },
        { path: '/partner-redemptions', icon: QrCode, label: 'Validations', permission: 'partner_portal', roles: ['partner'] },
        { path: '/partner/marketplace', icon: QrCode, label: 'Marketplace', permission: 'partner_portal', roles: ['partner'] },
      ]
  },
  {
    id: 'moderation',
    label: 'Modération & Sécurité',
    items: [
      { path: '/reports', icon: Shield, label: 'Rapports', permission: 'moderation' },
      { path: '/anti-cheat', icon: Shield, label: 'Anti-Cheat', permission: 'moderation' },
    ]
  },
  {
    id: 'analytics',
    label: 'Analytics & Tests',
    items: [
      { path: '/analytics', icon: BarChart3, label: 'Analytics', permission: 'analytics' },
      { path: '/ab-testing', icon: FlaskConical, label: 'Tests A/B', permission: 'analytics' },
      { path: '/admob', icon: Video, label: 'AdMob', permission: 'analytics' },
      { path: '/activity', icon: MessageSquare, label: 'Activity Log', permission: 'analytics' },
    ]
  },
  {
    id: 'system',
    label: 'Configuration',
    items: [
      { path: '/notifications', icon: Bell, label: 'Notifications', permission: 'notifications' },
      { path: '/system', icon: Settings, label: 'Système', permission: 'system' },
      { path: '/settings', icon: Settings, label: 'Paramètres', permission: 'settings' },
    ]
  }
];

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if viewport is mobile size
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // Close sidebar when switching to desktop view
      if (!mobile) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Global keyboard shortcuts (Ctrl+K for search, ? for shortcuts)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      // Show shortcuts dialog with ? key (not in input fields)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Filter menu items based on permissions
  const hasPermission = (permission) => {
    return !permission || user?.permissions?.includes('*') || user?.permissions?.includes(permission);
  };

  // Get current page title
  const getCurrentPageTitle = () => {
    for (const group of menuGroups) {
      const item = group.items.find(item => item.path === location.pathname);
      if (item) return item.label;
    }
    return 'Dashboard';
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Global Search Dialog */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      
      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col lg:relative lg:translate-x-0 lg:z-auto ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-blue-600 font-bold text-lg">Y!</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">YallaCatch!</h1>
              <p className="text-xs text-blue-200 font-medium">Admin Dashboard</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden text-white hover:bg-white/20"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 flex-1 overflow-y-auto">
          {menuGroups.map((group) => {
            const visibleItems = group.items.filter(item => {
              const roleOk = !item.roles || (user && item.roles.includes(user.role));
              return roleOk && hasPermission(item.permission);
            });
            if (visibleItems.length === 0) return null;
            
            const isCollapsed = collapsedGroups[group.id];
            const hasActiveItem = visibleItems.some(item => location.pathname === item.path);
            
            return (
              <div key={group.id} className="mb-2">
                {/* Group header */}
                {group.label && (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <span>{group.label}</span>
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                )}
                
                {/* Group items */}
                {!isCollapsed && visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-3 py-2.5 mb-0.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className={`h-4 w-4 mr-3 ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`} />
                      <span>{item.label}</span>
                      {isActive && (
                        <div className="ml-auto">
                          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.name || 'Administrateur Principal'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.email || 'admin@yallacatch.com'}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {user?.role === 'super_admin' ? 'Super Admin' : 
                 user?.role === 'admin' ? 'Admin' : 
                 user?.role === 'moderator' ? 'Moderateur' : 'Admin'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Top bar */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              
              <div className="hidden sm:block">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {getCurrentPageTitle()}
                </h2>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Search button */}
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:border-gray-700"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">Rechercher...</span>
                <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-600">
                  <Command className="h-3 w-3 inline" />K
                </kbd>
              </Button>
              
              {/* Keyboard shortcuts button */}
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => setShortcutsOpen(true)}
                title="Raccourcis clavier"
              >
                <Keyboard className="h-5 w-5" />
              </Button>
              
              {/* Theme toggle */}
              <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
              
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>En ligne</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden lg:block">
                {new Date().toLocaleString('fr-FR', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
