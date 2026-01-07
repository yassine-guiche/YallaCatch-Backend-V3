import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingUp, Shield, Users, Activity, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  getFlaggedClaims,
  getMetrics as getAntiCheatMetrics,
  getPatterns as getDetectionPatterns,
  overrideClaim as overrideFlaggedClaim,
  exportReport as exportAntiCheatReport,
  getRecentAlerts,
  getSettings,
  updateSettings,
} from '../services/antiCheat';

/**
 * Anti-Cheat Monitoring Dashboard
 * Real-time fraud detection and claim validation interface
 */
const AntiCheatDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [flaggedClaims, setFlaggedClaims] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);
  const [patterns, setPatterns] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [filterRiskLevel, setFilterRiskLevel] = useState('all');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Fetch anti-cheat data
  useEffect(() => {
    fetchAntiCheatData();
    const interval = setInterval(fetchAntiCheatData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['capture_created', 'capture_update', 'fraud_detected', 'stats_update'],
    onMessage: (event, data) => {
      if (event === 'fraud_detected' || event.includes('capture')) {
        fetchAntiCheatData();
        if (event === 'fraud_detected') {
          toast.warning('Activité suspecte détectée');
        }
      } else if (event === 'stats_update' && data.stats) {
        setMetrics(prev => ({ ...prev, ...data.stats }));
      }
    }
  });

  const fetchAntiCheatData = async () => {
    try {
      setLoading(true);
      
      const [
        metricsData,
        claimsData,
        patternsData,
        alertsData,
        settingsData,
      ] = await Promise.all([
        getAntiCheatMetrics(),
        getFlaggedClaims({ limit: 50 }),
        getDetectionPatterns(),
        getRecentAlerts({ limit: 20 }),
        getSettings(),
      ]);

      setMetrics(metricsData);
      setFlaggedClaims(claimsData.items || claimsData.claims || []);
      setPatterns(patternsData);
      setAlerts(alertsData.items || []);
      setSettings(settingsData);
      setError(null);
    } catch (err) {
      setError('Failed to load anti-cheat data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      setSavingSettings(true);
      await updateSettings({
        riskThreshold: Number(settings.riskThreshold),
        criticalThreshold: Number(settings.criticalThreshold),
        autoRejectAbove: Number(settings.autoRejectAbove),
        autoApproveBelow: Number(settings.autoApproveBelow),
      });
      toast.success('Paramètres anti-triche mis à jour');
    } catch (err) {
      toast.error('Échec de la mise à jour des paramètres : ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOverrideClaim = async (claimId, decision) => {
    try {
      await overrideFlaggedClaim({
        claimId,
        decision,
        notes: overrideReason
      });

      setSelectedClaim(null);
      setOverrideReason('');
      toast.success(`Claim ${decision === 'approve' ? 'approved' : 'rejected'}`);
      fetchAntiCheatData();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const exportReport = async () => {
    try {
      const data = await exportAntiCheatReport();
      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2)));
      element.setAttribute('download', `anti-cheat-report-${new Date().toISOString().split('T')[0]}.json`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success('Report exported');
    } catch (err) {
      toast.error('Failed to export report: ' + err.message);
    }
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'LOW': return '#10b981';
      case 'MEDIUM': return '#f59e0b';
      case 'HIGH': return '#ef4444';
      case 'CRITICAL': return '#7c2d12';
      default: return '#6b7280';
    }
  };

  const getRecommendationBadge = (rec) => {
    const colors = {
      'SAFE': '#10b981',
      'MONITOR': '#f59e0b',
      'RESTRICT': '#ef4444',
      'BAN': '#7c2d12'
    };
    return (
      <span style={{
        backgroundColor: colors[rec],
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        {rec}
      </span>
    );
  };

  if (loading && !metrics) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading anti-cheat data...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={32} color="#ef4444" />
          Anti-Cheat Monitoring
        </h1>
        <button
          onClick={exportReport}
          style={{
            padding: '10px 15px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Download size={16} />
          Export Report
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          color: '#991b1b',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          display: 'flex',
          gap: '10px'
        }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Overview Metrics */}
      {metrics && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '15px',
          marginBottom: '30px'
        }}>
          <MetricCard
            title="Total Claims Analyzed"
            value={metrics.totalClaimsAnalyzed}
            icon={<Activity size={24} />}
          />
          <MetricCard
            title="Flagged Claims"
            value={metrics.flaggedClaimsCount}
            subtitle={`${metrics.totalClaimsAnalyzed ? ((metrics.flaggedClaimsCount / metrics.totalClaimsAnalyzed) * 100).toFixed(1) : '0.0'}% of total`}
            icon={<AlertCircle size={24} />}
            highlight
          />
          <MetricCard
            title="Approval Rate"
            value={`${metrics.approvalRate.toFixed(1)}%`}
            icon={<TrendingUp size={24} />}
          />
          <MetricCard
            title="Rejection Rate"
            value={`${metrics.rejectionRate.toFixed(1)}%`}
            icon={<AlertCircle size={24} />}
          />
          <MetricCard
            title="Override Rate"
            value={`${metrics.overrideRate.toFixed(1)}%`}
            icon={<Shield size={24} />}
          />
          <MetricCard
            title="Top Flagged Users"
            value={metrics.topFlaggedUsers?.length || 0}
            icon={<Users size={24} />}
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
      display: 'flex',
      gap: '10px',
      borderBottom: '2px solid #e5e7eb',
      marginBottom: '20px'
    }}>
        {['overview', 'flagged-claims', 'user-profiles', 'patterns', 'alerts', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            style={{
              padding: '10px 15px',
              border: 'none',
              backgroundColor: selectedTab === tab ? '#3b82f6' : 'transparent',
              color: selectedTab === tab ? 'white' : '#6b7280',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              textTransform: 'capitalize'
            }}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && metrics && (
        <div>
          <h3>Risk Score Distribution</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px'
          }}>
            {[
              { label: 'Low Risk', value: metrics.riskScoreDistribution.low, color: '#10b981' },
              { label: 'Medium Risk', value: metrics.riskScoreDistribution.medium, color: '#f59e0b' },
              { label: 'High Risk', value: metrics.riskScoreDistribution.high, color: '#ef4444' },
              { label: 'Critical', value: metrics.riskScoreDistribution.critical, color: '#7c2d12' }
            ].map(risk => (
              <div key={risk.label} style={{
                backgroundColor: '#f3f4f6',
                padding: '15px',
                borderRadius: '8px',
                borderLeft: `4px solid ${risk.color}`
              }}>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{risk.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: risk.color }}>{risk.value}</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '30px' }}>Top Risk Factors</h3>
          <div style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px' }}>
            {metrics.topRiskFactors?.map((factor, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < metrics.topRiskFactors.length - 1 ? '1px solid #e5e7eb' : 'none'
              }}>
                <span>{factor.factor}</span>
                <span style={{ fontWeight: 'bold' }}>{factor.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'flagged-claims' && (
        <div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ marginRight: '10px' }}>Filter by Risk Level:</label>
            <select
              value={filterRiskLevel}
              onChange={(e) => setFilterRiskLevel(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>User ID</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Risk Score</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Factors</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(flaggedClaims) ? flaggedClaims : []).slice(0, 20).map((claim, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px' }}>{String(claim.userId).slice(0, 8)}</td>
                    <td style={{
                      padding: '12px',
                      color: getRiskColor(
                        claim.riskScore >= 75 ? 'CRITICAL' :
                        claim.riskScore >= 50 ? 'HIGH' : 'MEDIUM'
                      ),
                      fontWeight: 'bold'
                    }}>
                      {claim.riskScore?.toFixed(1) || 'N/A'}
                    </td>
                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>
                      {claim.status || 'pending'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px' }}>
                      {claim.riskFactors?.slice(0, 2).join(', ') || 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => setSelectedClaim(claim)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTab === 'user-profiles' && metrics && (
        <div>
          <h3>Top Flagged Users</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '15px'
          }}>
            {metrics.topFlaggedUsers?.map((user, idx) => (
              <div key={idx} style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '15px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>{user.username || 'Unknown'}</h4>
                  {getRecommendationBadge(user.recommendation)}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                  User ID: {String(user.userId).slice(0, 8)}
                </div>
                <div style={{
                  backgroundColor: 'white',
                  padding: '10px',
                  borderRadius: '4px',
                  marginBottom: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Risk Level:</span>
                    <span style={{ color: getRiskColor(user.riskLevel), fontWeight: 'bold' }}>
                      {user.riskLevel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Risk Score:</span>
                    <span>{user.riskScore.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Flagged Claims:</span>
                    <span>{user.flaggedClaimsCount}</span>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  Suspicious Patterns: {user.suspiciousPatterns?.join(', ') || 'None detected'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'patterns' && patterns && (
        <div>
          <h3>Detected Fraud Patterns</h3>
          {patterns.patterns?.map((pattern, idx) => (
            <div key={idx} style={{
              backgroundColor: '#f9fafb',
              border: `1px solid ${
                pattern.severity === 'critical' ? '#fee2e2' :
                pattern.severity === 'high' ? '#fef3c7' : '#e0e7ff'
              }`,
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '15px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h4 style={{ margin: '0 0 5px 0' }}>{pattern.name}</h4>
                  <p style={{ margin: '5px 0', color: '#6b7280', fontSize: '14px' }}>
                    {pattern.description}
                  </p>
                </div>
                <span style={{
                  backgroundColor:
                    pattern.severity === 'critical' ? '#fecaca' :
                    pattern.severity === 'high' ? '#fcd34d' : '#bfdbfe',
                  color:
                    pattern.severity === 'critical' ? '#7c2d12' :
                    pattern.severity === 'high' ? '#92400e' : '#1e40af',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textTransform: 'capitalize'
                }}>
                  {pattern.severity}
                </span>
              </div>
              <div style={{ marginTop: '10px', color: '#374151', fontSize: '14px' }}>
                <strong>Affected Users:</strong> {pattern.affectedUsersCount}
              </div>
            </div>
          ))}

          <h3 style={{ marginTop: '30px' }}>Recommendations</h3>
          <ul style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '15px' }}>
            {patterns.recommendations?.map((rec, idx) => (
              <li key={idx} style={{ marginBottom: '8px', color: '#166534' }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedTab === 'alerts' && (
        <div>
          <h3>Alertes récentes</h3>
          {alerts.length === 0 && (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px dashed #d1d5db',
              padding: '12px',
              borderRadius: '6px',
              color: '#6b7280'
            }}>
              Aucune alerte critique pour le moment.
            </div>
          )}
          {alerts.map((alert) => (
            <div key={String(alert._id)} style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>
                  Claim #{String(alert._id).slice(0, 8)}
                </div>
                <div style={{ color: '#6b7280', fontSize: '13px' }}>
                  User: {String(alert.userId || '').slice(0, 8)} · Score: {alert.riskScore?.toFixed?.(1) || '—'}
                </div>
                <div style={{ color: '#6b7280', fontSize: '12px' }}>
                  {alert.riskFactors?.join(', ') || 'No factors'}
                </div>
              </div>
              <span style={{
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px'
              }}>
                {new Date(alert.flaggedAt || alert.createdAt || Date.now()).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedTab === 'settings' && settings && (
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '16px',
          maxWidth: '600px'
        }}>
          <h3 style={{ marginTop: 0 }}>Paramètres anti-triche</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
              Seuil risque (high)
              <input
                type="number"
                value={settings.riskThreshold ?? ''}
                onChange={e => handleSettingsChange('riskThreshold', e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
              Seuil critique
              <input
                type="number"
                value={settings.criticalThreshold ?? ''}
                onChange={e => handleSettingsChange('criticalThreshold', e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
              Auto-reject au-dessus de
              <input
                type="number"
                value={settings.autoRejectAbove ?? ''}
                onChange={e => handleSettingsChange('autoRejectAbove', e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
              Auto-approve en dessous de
              <input
                type="number"
                value={settings.autoApproveBelow ?? ''}
                onChange={e => handleSettingsChange('autoApproveBelow', e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </label>
          </div>
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={fetchAntiCheatData}
              style={{
                padding: '10px 12px',
                backgroundColor: '#e5e7eb',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Réinitialiser
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{
                padding: '10px 14px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                opacity: savingSettings ? 0.7 : 1
              }}
            >
              {savingSettings ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Override Claim Modal */}
      {selectedClaim && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3>Override Claim Decision</h3>
            <p>Claim ID: {String(selectedClaim._id).slice(0, 12)}</p>
            <p>Risk Score: <span style={{ fontWeight: 'bold', color: '#ef4444' }}>
              {selectedClaim.riskScore?.toFixed(1)}
            </span></p>

            <textarea
              placeholder="Reason for override (optional)"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              style={{
                width: '100%',
                height: '100px',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                marginBottom: '15px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedClaim(null)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e5e7eb',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleOverrideClaim(selectedClaim._id, 'reject')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Reject
              </button>
              <button
                onClick={() => handleOverrideClaim(selectedClaim._id, 'approve')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, subtitle, icon, highlight }) => (
  <div style={{
    backgroundColor: highlight ? '#fef2f2' : '#f9fafb',
    border: highlight ? '2px solid #fecaca' : '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  }}>
    <div style={{ color: highlight ? '#ef4444' : '#6b7280' }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{title}</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
        {value}
      </div>
      {subtitle && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{subtitle}</div>}
    </div>
  </div>
);

export default AntiCheatDashboard;
