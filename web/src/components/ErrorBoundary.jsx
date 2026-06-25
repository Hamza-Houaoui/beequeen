import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronUp } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      showDetails: false,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.toString()}\n\nStack Trace:\n${errorInfo?.componentStack}`;
    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  toggleDetails = () => {
    this.setState(prevState => ({ showDetails: !prevState.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--color-black)',
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(212, 175, 55, 0.15), transparent 60%)',
          color: 'var(--color-text-primary)',
          padding: '24px',
          textAlign: 'center',
          fontFamily: "'Outfit', sans-serif"
        }}>
          <div className="glass-panel-gold" style={{
            maxWidth: '600px',
            width: '100%',
            padding: '40px 32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            direction: 'ltr'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: 'rgba(212, 175, 55, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--color-gold)',
              boxShadow: '0 0 20px rgba(212, 175, 55, 0.2)',
              animation: 'pulse 2s infinite'
            }}>
              <AlertTriangle size={40} color="var(--color-gold)" />
            </div>

            <div>
              <h1 style={{
                color: 'var(--color-gold)',
                fontSize: '1.8rem',
                margin: '0 0 12px 0',
                fontWeight: '700',
                letterSpacing: '0.5px'
              }}>Unexpected System Error</h1>
              <p style={{
                color: 'var(--color-text-secondary)',
                fontSize: '1rem',
                margin: 0,
                lineHeight: '1.6'
              }}>
                We apologize for the inconvenience. The application encountered a technical issue and stopped working correctly.
              </p>
              <p style={{
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.85rem',
                margin: '8px 0 0 0',
                fontStyle: 'italic',
                direction: 'ltr'
              }}>
                Something went wrong. The application encountered an unexpected error.
              </p>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              width: '100%',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: '8px',
              direction: 'ltr'
            }}>
              <button 
                onClick={this.handleReload}
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={18} />
                <span>Reload Application</span>
              </button>

              <button 
                onClick={this.handleCopy}
                className="secondary"
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <Copy size={18} />
                <span>{this.state.copied ? 'Copied!' : 'Copy Error Details'}</span>
              </button>
            </div>

            <div style={{ width: '100%', marginTop: '12px', textAlign: 'right' }}>
              <button
                className="secondary"
                onClick={this.toggleDetails}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-gold)',
                  padding: '4px 8px',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: 'auto',
                  boxShadow: 'none',
                  transform: 'none',
                  direction: 'ltr'
                }}
              >
                <span>{this.state.showDetails ? 'Hide Technical Details' : 'Show Technical Details'}</span>
                {this.state.showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {this.state.showDetails && (
                <div style={{
                  marginTop: '12px',
                  padding: '16px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  textAlign: 'left',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: '#ff6b6b',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  direction: 'ltr'
                }}>
                  <strong>{this.state.error && this.state.error.toString()}</strong>
                  <br /><br />
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </div>
              )}
            </div>
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); }
              70% { box-shadow: 0 0 0 15px rgba(212, 175, 55, 0); }
              100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); }
            }
          `}} />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
