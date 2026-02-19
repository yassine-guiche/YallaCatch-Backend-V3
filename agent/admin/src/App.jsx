import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginForm from './components/LoginForm';
import PartnerLogin from './partner-portal/PartnerLogin';
import PartnerRegister from './partner-portal/PartnerRegister';
import ProtectedRoute from './components/ProtectedRoute';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { Toaster } from './components/ui/sonner';
import './App.css';

// Route-based code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UsersManagement = lazy(() => import('./pages/UsersManagement'));
const PrizeDistributionPage = lazy(() => import('./pages/PrizeDistributionPage'));
const RewardsManagement = lazy(() => import('./pages/RewardsManagement'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage_Complete'));
const NotificationsManagement = lazy(() => import('./pages/NotificationsManagement_Complete'));
const PrizeClaimsManagement = lazy(() => import('./pages/PrizeClaimsManagement'));
const SettingsPage = lazy(() => import('./pages/SettingsPage_Complete'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const AchievementsManagement = lazy(() => import('./pages/AchievementsManagement'));
const SystemManagement = lazy(() => import('./pages/SystemManagement'));
const MarketplaceManagement = lazy(() => import('./pages/MarketplaceManagement'));
const PartnersManagement = lazy(() => import('./pages/PartnersManagement'));
const ReportsManagement = lazy(() => import('./pages/ReportsManagement'));
const PromoCodesManagement = lazy(() => import('./pages/PromoCodesManagement'));
const AdMobDashboard = lazy(() => import('./pages/AdMobDashboard'));
const PowerUpManagement = lazy(() => import('./pages/PowerUpManagement'));
const AntiCheatDashboard = lazy(() => import('./pages/AntiCheatDashboard'));
const ABTestingManagement = lazy(() => import('./pages/ABTestingManagement'));
const GameMonitoringPage = lazy(() => import('./pages/GameMonitoringPage'));
const FriendshipsManagement = lazy(() => import('./pages/FriendshipsManagement'));
const PartnerRedemptions = lazy(() => import('./partner-portal/PartnerRedemptions'));
const PartnerPortal = lazy(() => import('./partner-portal/PartnerPortal'));
const PartnerMarketplace = lazy(() => import('./partner-portal/PartnerMarketplace'));
const PartnerLayout = lazy(() => import('./partner-portal/PartnerLayout'));
const PartnerProfile = lazy(() => import('./partner-portal/PartnerProfile'));


function App() {
  return (
    <AuthProvider>
      <GlobalErrorBoundary>
        <Router>
          <div className="h-screen overflow-hidden bg-gray-50">
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Chargement...</p>
                  </div>
                </div>
              }
            >
              <Routes>
                {/* Public route */}
                <Route path="/login" element={<LoginForm />} />
                <Route path="/partner/login" element={<PartnerLogin />} />
                <Route path="/partner/register" element={<PartnerRegister />} />

                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/users"
                  element={
                    <ProtectedRoute requiredPermission="users">
                      <Layout>
                        <UsersManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/prizes"
                  element={
                    <ProtectedRoute requiredPermission="prizes">
                      <Layout>
                        <PrizeDistributionPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/rewards"
                  element={
                    <ProtectedRoute requiredPermission="rewards">
                      <Layout>
                        <RewardsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/claims"
                  element={
                    <ProtectedRoute requiredPermission="claims">
                      <Layout>
                        <PrizeClaimsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute requiredPermission="analytics">
                      <Layout>
                        <AnalyticsPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/activity"
                  element={
                    <ProtectedRoute requiredPermission="analytics">
                      <Layout>
                        <ActivityLog />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/achievements"
                  element={
                    <ProtectedRoute requiredPermission="gamification">
                      <Layout>
                        <AchievementsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute requiredPermission="notifications">
                      <Layout>
                        <NotificationsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute requiredPermission="settings">
                      <Layout>
                        <SettingsPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Redirect old distribution route to unified prizes page */}
                <Route
                  path="/distribution"
                  element={<Navigate to="/prizes" replace />}
                />

                <Route
                  path="/system"
                  element={
                    <ProtectedRoute requiredPermission="system">
                      <Layout>
                        <SystemManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/marketplace"
                  element={
                    <ProtectedRoute requiredPermission="marketplace">
                      <Layout>
                        <MarketplaceManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/partners"
                  element={
                    <ProtectedRoute requiredPermission="partners">
                      <Layout>
                        <PartnersManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/partner-redemptions"
                  element={
                    <ProtectedRoute requiredPermission="partner_portal">
                      <PartnerLayout>
                        <PartnerRedemptions />
                      </PartnerLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/partner-portal"
                  element={
                    <ProtectedRoute requiredPermission="partner_portal">
                      <PartnerLayout>
                        <PartnerPortal />
                      </PartnerLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/partner/marketplace"
                  element={
                    <ProtectedRoute requiredPermission="partner_portal">
                      <PartnerLayout>
                        <PartnerMarketplace />
                      </PartnerLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/partner/profile"
                  element={
                    <ProtectedRoute requiredPermission="partner_portal">
                      <PartnerLayout>
                        <PartnerProfile />
                      </PartnerLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute requiredPermission="moderation">
                      <Layout>
                        <ReportsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/promo-codes"
                  element={
                    <ProtectedRoute requiredPermission="marketing">
                      <Layout>
                        <PromoCodesManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admob"
                  element={
                    <ProtectedRoute requiredPermission="analytics">
                      <Layout>
                        <AdMobDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/power-ups"
                  element={
                    <ProtectedRoute requiredPermission="gamification">
                      <Layout>
                        <PowerUpManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/anti-cheat"
                  element={
                    <ProtectedRoute requiredPermission="moderation">
                      <Layout>
                        <AntiCheatDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/ab-testing"
                  element={
                    <ProtectedRoute requiredPermission="analytics">
                      <Layout>
                        <ABTestingManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/game-monitoring"
                  element={
                    <ProtectedRoute requiredPermission="analytics">
                      <Layout>
                        <GameMonitoringPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/friendships"
                  element={
                    <ProtectedRoute requiredPermission="users">
                      <Layout>
                        <FriendshipsManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Redirect any unknown routes to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <Toaster richColors position="top-right" />
          </div>
        </Router>
      </GlobalErrorBoundary>
    </AuthProvider>
  );
}

export default App;
