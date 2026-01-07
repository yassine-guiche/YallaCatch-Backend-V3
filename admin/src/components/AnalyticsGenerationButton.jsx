import React from 'react';
import { generateDailyAnalytics } from '@/services/analyticsAggregation';

const AnalyticsGenerationButton = () => {
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    
    try {
      const data = await generateDailyAnalytics();
      if (data) {
        setResult(`Analytics generated successfully with ID: ${data.id}`);
      } else {
        setError('Failed to generate analytics');
      }
    } catch (err) {
      console.error('Error generating analytics:', err);
      setError('Error generating analytics: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Analytics Data</h3>
      <p className="text-gray-600 mb-4">
      </p>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {generating ? 'Generating...' : 'Generate Today\'s Analytics'}
      </button>
      
      {result && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-green-800">{result}</p>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsGenerationButton;