import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { Toaster } from "@/components/ui/Toaster";
import { toast } from "@/lib/toast";
import { errorMessage } from "@/lib/utils";
import "./styles/index.css";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { label?: string };
  }
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      toast.error(`${mutation.meta?.label ?? "Action"} failed`, errorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>
);
