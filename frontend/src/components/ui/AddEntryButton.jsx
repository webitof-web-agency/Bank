import { Plus } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/cn';

// The one create action of a listing page: "+ Add Entry", coloured by the
// entry type (pink paid-out, green received, primary for masters). It only
// opens the page's existing create form — pass that page's own onClick.
const TONES = {
  pink: 'bg-[var(--entry-pink-action,#C2486A)] text-white hover:opacity-90',
  green: 'bg-[var(--entry-green-action,#2F8F5B)] text-white hover:opacity-90',
  mint: 'bg-[var(--entry-green-action,#2F8F5B)] text-white hover:opacity-90',
  neutral: 'bg-[var(--primary,#1661F6)] text-white hover:opacity-90'
};

export function AddEntryButton({ variant = 'neutral', className = '', children = 'Add Entry', ...props }) {
  return (
    <Button type="button" className={cn('gap-2', TONES[variant] || TONES.neutral, className)} {...props}>
      <Plus size={16} />
      {children}
    </Button>
  );
}

export default AddEntryButton;
