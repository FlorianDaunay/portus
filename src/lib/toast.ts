import { create } from "zustand";

export type ToastKind = "error" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, title: string, message?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, title, message) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, title, message }] }));
    setTimeout(() => get().dismiss(id), kind === "error" ? 10000 : 5000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  error: (title: string, message?: string) => useToastStore.getState().push("error", title, message),
  success: (title: string, message?: string) => useToastStore.getState().push("success", title, message),
};
