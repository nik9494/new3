import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  text?: string;
}

/**
 * Component for displaying a loading spinner
 */
export function LoadingSpinner({
  size = 24,
  className = "",
  text,
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 className={`h-${size} w-${size} animate-spin`} />
      {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export default LoadingSpinner;
