import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertCircle } from 'lucide-react';

/**
 * PrivateRoute - Protège les routes nécessitant une authentification
 * @param {Object} props - Propriétés
 * @param {React.Component} props.component - Composant à rendre
 * @param {string} props.requiredRole - Rôle requis ('admin', 'user', etc.)
 * @param {boolean} props.fallback - Afficher l'erreur d'accès au lieu de rediriger
 */
export default function PrivateRoute({ 
  component: Component, 
  requiredRole = 'admin',
  fallback = false,
  ...rest 
}) {
  const ComponentToRender = Component;
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access
  const hasRequiredRole = user?.role === requiredRole || user?.role === 'superadmin';

  if (!hasRequiredRole) {
    if (fallback) {
      return (
        <div className="container mx-auto px-4 py-8">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-red-700">Accès Refusé</CardTitle>
              </div>
              <CardDescription>
                Vous n'avez pas les permissions nécessaires pour accéder à cette page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-600">
                Rôle requis: <strong>{requiredRole}</strong> | Votre rôle: <strong>{user?.role}</strong>
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    // Redirect to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // All checks passed - render component
  return <ComponentToRender {...rest} />;
}
