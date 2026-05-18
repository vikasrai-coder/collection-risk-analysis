import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-500 max-w-md mb-8">
            Collection Risk Analysis encountered an unexpected error. Don't worry, your data is safe. 
            {this.state.error && <span className="block mt-2 font-mono text-[10px] bg-gray-100 p-2 rounded opacity-70 italic">{this.state.error.message}</span>}
          </p>
          <div className="flex gap-3">
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
            >
              <RefreshCcw className="h-4 w-4" /> Reload App
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/'}
              className="font-bold gap-2"
            >
              <Home className="h-4 w-4" /> Go Home
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
