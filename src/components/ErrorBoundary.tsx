import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl max-w-md w-full border border-destructive/20">
            <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado.</h2>
            <p className="text-sm opacity-90 mb-4">
              Ocorreu um erro inesperado ao carregar esta tela.
            </p>
            <div className="bg-background text-foreground text-left p-3 rounded text-xs font-mono overflow-auto max-h-48 mb-4 border border-border shadow-inner">
              {this.state.error?.toString()}
            </div>
            <button 
              className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md font-bold text-sm w-full"
              onClick={() => window.location.reload()}
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
