import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './ErrorBoundary.module.css';
import { logger } from '../../../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Обновляем состояние, чтобы следующий рендер показал fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', error, { errorInfo });

    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReportError = () => {
    // Error reporting handled automatically via logger.error in componentDidCatch
    // which sends errors to Sentry in production
    const errorReport = {
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Already sent to Sentry via logger.error in componentDidCatch
    logger.error('User manually reported error', this.state.error as Error, errorReport);
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorBoundaryContent 
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        onRetry={this.handleRetry}
        onReport={this.handleReportError}
      />;
    }

    return this.props.children;
  }
}

const ErrorBoundaryContent: React.FC<{
  error?: Error;
  errorInfo?: ErrorInfo;
  onRetry: () => void;
  onReport: () => void;
}> = ({ error, errorInfo, onRetry, onReport }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.errorBoundary}>
      <div className={styles.errorContent}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2 className={styles.errorTitle}>{t('common.somethingWentWrong')}</h2>
        <p className={styles.errorMessage}>
          {t('common.unexpectedErrorOccurred')}
        </p>
        
        {process.env.NODE_ENV === 'development' && error && (
          <details className={styles.errorDetails}>
            <summary>{t('common.errorDetailsDevelopment')}</summary>
            <pre className={styles.errorStack}>
              {error.toString()}
              {errorInfo?.componentStack}
            </pre>
          </details>
        )}

        <div className={styles.errorActions}>
          <button 
            onClick={onRetry}
            className={styles.retryButton}
          >
            {t('common.tryAgain')}
          </button>
          <button 
            onClick={onReport}
            className={styles.reportButton}
          >
            {t('common.reportError')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary; 