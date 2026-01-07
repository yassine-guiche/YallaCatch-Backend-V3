// Test file to verify AnalyticsPage real-time functionality
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AnalyticsPage from './AnalyticsPage_Complete';

// Mock the analytics service
jest.mock('../services/analytics', () => ({
  subscribeOverview: jest.fn((callback) => {
    callback({ 
      totalUsers: 2847, 
      activeUsers: 1456, 
      conversionRate: 23.5, 
      revenueGenerated: 45600 
    });
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeUserGrowth: jest.fn((callback) => {
    callback([
      { date: '2024-08-29', users: 2847, active: 1456 }
    ]);
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeCityDistribution: jest.fn((callback) => {
    callback([
      { city: 'Tunis', users: 856, percentage: 30.1 }
    ]);
    return jest.fn(); // Return unsubscribe function
  }),
  subscribePrizeActivity: jest.fn((callback) => {
    callback([
      { date: '2024-08-29', captured: 49, created: 13, points: 24500 }
    ]);
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeLevelDistribution: jest.fn((callback) => {
    callback([
      { level: 'Bronze', users: 1423, percentage: 50.0 }
    ]);
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeEngagementMetrics: jest.fn((callback) => {
    callback({
      dailyActiveUsers: 1456,
      weeklyActiveUsers: 2134,
      monthlyActiveUsers: 2847
    });
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeRevenueData: jest.fn((callback) => {
    callback([
      { month: 'Septembre', revenue: 48200, partnerships: 21 }
    ]);
    return jest.fn(); // Return unsubscribe function
  }),
  subscribeDeviceStats: jest.fn((callback) => {
    callback({
      mobile: { count: 2278, percentage: 80.0 },
      tablet: { count: 398, percentage: 14.0 },
      desktop: { count: 171, percentage: 6.0 }
    });
    return jest.fn(); // Return unsubscribe function
  })
}));

describe('AnalyticsPage', () => {
  test('renders loading state initially', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('Chargement des données analytiques...')).toBeInTheDocument();
  });

  test('displays analytics data after loading', async () => {
    render(<AnalyticsPage />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Analytics Avancées')).toBeInTheDocument();
    });
    
    // Check that key metrics are displayed
    expect(screen.getByText('2,847')).toBeInTheDocument(); // Total users
    expect(screen.getByText('1,456')).toBeInTheDocument(); // Active users
    expect(screen.getByText('23.5%')).toBeInTheDocument(); // Conversion rate
    expect(screen.getByText('48 200,000 TND')).toBeInTheDocument(); // Revenue
  });

  test('handles error state', () => {
    // This would test error handling if we had a way to trigger errors
    // In a real test, we would mock the service to throw an error
  });
});