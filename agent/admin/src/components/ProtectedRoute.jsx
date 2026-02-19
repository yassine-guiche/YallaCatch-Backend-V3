import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredPermission = null }) => {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();
  const isPartnerRoute = /^\/partner(?:\/|-|$)/.test(location.pathname);
  const loginPath = isPartnerRoute ? '/partner/login' : '/login';
  const allowedRoles = requiredPermission === 'partner_portal'
    ? ['partner']
    : ['admin', 'super_admin', 'moderator'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">AccÇùs refusÇ¸</h2>
          <p className="text-gray-600">Vous n'avez pas les permissions nÇ¸cessaires pour accÇ¸der Çÿ cette page.</p>
        </div>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Accès refusé</h2>
          <p className="text-gray-600">Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
