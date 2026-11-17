import { StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link as RouterLink } from "react-router";
import { TooltipProvider } from "@nocoo/basalt/components/tooltip";
import { Toaster } from "@nocoo/basalt/components/toast";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { LinkProvider } from "@nocoo/basalt/providers/link";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import { App } from "./App";
import "./index.css";

const RouterLinkAdapter: ComponentType<{
  href: string;
  className?: string | undefined;
  children?: ReactNode | undefined;
}> = ({ href, className, children }) => {
  const external = /^(?:https?:|mailto:|tel:|\/\/)/.test(href);
  if (external) {
    return (
      <a href={href} className={className} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <RouterLink to={href} className={className}>{children}</RouterLink>;
};

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AccentProvider
          paletteOverrides={{
            primary: { light: "146 49% 35%", dark: "146 40% 30%" },
          }}
        >
          <LinkProvider render={RouterLinkAdapter}>
            <TooltipProvider>
              <App />
              <Toaster />
            </TooltipProvider>
          </LinkProvider>
        </AccentProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
