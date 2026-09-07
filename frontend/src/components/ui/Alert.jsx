import React from 'react';

export function Alert({ children, variant = 'default', className = '' }) {
  const base = "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground";
  const variants = {
    default: "bg-background text-foreground",
    destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive"
  };
  return <div role="alert" className={`${base} ${variants[variant] || variants.default} ${className}`}>{children}</div>;
}

export function AlertTitle({ children, className = '' }) {
  return <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`}>{children}</h5>;
}

export function AlertDescription({ children, className = '' }) {
  return <div className={`text-sm [&_p]:leading-relaxed ${className}`}>{children}</div>;
}
