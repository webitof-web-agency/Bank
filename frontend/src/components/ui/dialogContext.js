import { createContext, useContext } from 'react';

// True for anything rendered inside a Modal. The dialog is the one card: a
// Card inside it draws no frame of its own, and forms can leave out a heading
// that repeats the dialog title.
export const DialogContext = createContext(false);

export function useInDialog() {
  return useContext(DialogContext);
}
