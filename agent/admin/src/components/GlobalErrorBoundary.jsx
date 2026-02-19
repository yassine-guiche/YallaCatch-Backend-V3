import React from 'react';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to an error reporting service
    console.error('Global error caught by boundary:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50">
          <div className="text-center p-8 bg-white border border-red-300 rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-700 mb-4">Dashboard Error</h1>
            <p className="text-red-600 mb-6">The dashboard has encountered a critical error and cannot continue.</p>
            <button 
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
            >
              Reload Dashboard
            </button>
            {import.meta.env.DEV && (
              <details className="text-left mt-6 text-red-600" open>
                <summary className="cursor-pointer font-medium">Technical Details</summary>
                {this.state.error && (
                  <div className="mt-2 p-4 bg-red-200 rounded text-sm font-bold">
                    Error: {this.state.error.toString()}
                  </div>
                )}
                {this.state.errorInfo && (
                  <pre className="mt-2 p-4 bg-red-100 rounded text-sm overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
