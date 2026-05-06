// Server-side render entry. Imported by the worker's catch-all route.
//
// Per request we build:
//   • a fresh Griffel renderer (so its CSS map is request-scoped)
//   • a fresh QueryClient (so prefetched data doesn't leak across users)
//   • a static React Router instance bound to this request's URL
//
// The render output is a string of HTML + a set of <style> elements + the
// dehydrated query cache. The worker stitches these into the prebuilt
// dist/client/index.html template before responding.

import { renderToString } from "react-dom/server";
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from "@tanstack/react-query";
import {
  RendererProvider,
  createDOMRenderer,
  renderToStyleElements,
} from "@fluentui/react-components";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "./components/ThemeProvider";
import { routes } from "./routes";
import { createServerI18n } from "./i18n/init";

export interface RenderOptions {
  /** The prebuilt index.html template. */
  template: string;
  /** Initial auth state for the client to hydrate from, if known. */
  auth?: { token: string | null; user: unknown | null };
  /** Server-detected locale. */
  locale?: string;
  /**
   * Pre-fetched query data to seed the QueryClient with. The worker uses
   * this to hand the SSR pass things it can compute cheaply (site config,
   * the authenticated user's profile, etc.) so route components render
   * with real data instead of a "loading…" skeleton.
   */
  prefetched?: Array<{ queryKey: unknown[]; data: unknown }>;
}

export interface RenderResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// `react-router-dom`'s `createStaticHandler` expects `Request`, but the static
// handler now lives in the framework-agnostic `react-router` package. Both are
// re-exports of the same module, so importing from either works.

export async function render(
  request: Request,
  opts: RenderOptions,
): Promise<RenderResult> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(request);

  // The handler returns a Response for redirects (loaders/actions throwing).
  // Surface those directly so the worker can issue a 30x.
  if (context instanceof Response) {
    const location = context.headers.get("Location") ?? "/";
    return {
      status: context.status,
      headers: { Location: location },
      body: "",
    };
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // SSR shouldn't refetch; data is prefetched in loaders.
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  // Seed query cache with worker-supplied prefetches so components render
  // with real data on the server instead of a loading state.
  for (const { queryKey, data } of opts.prefetched ?? []) {
    queryClient.setQueryData(queryKey, data);
  }
  const renderer = createDOMRenderer();
  const router = createStaticRouter(handler.dataRoutes, context);
  const i18n = createServerI18n(opts.locale ?? "en");

  // Did we hit the catch-all route? If so, the response should be 404 even
  // though the rendered page is the same NotFound component the client would
  // show on a SPA navigation.
  const matchedNotFound = context.matches.some(
    (m) => m.route.id === "not-found",
  );

  const appHtml = renderToString(
    <RendererProvider renderer={renderer}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <StaticRouterProvider router={router} context={context} />
          </ThemeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </RendererProvider>,
  );

  // Griffel emits an array of <style> elements; we serialise them to a
  // markup string so the worker can splice them into <head>.
  const styleElements = renderToStyleElements(renderer);
  const styleHtml = styleElements
    .map((el) => {
      // Each element is { type: 'style', props: { dangerouslySetInnerHTML, ... } }
      const props = (el.props ?? {}) as {
        dangerouslySetInnerHTML?: { __html: string };
        "data-make-styles-bucket"?: string;
        "data-priority"?: string;
      };
      const css = props.dangerouslySetInnerHTML?.__html ?? "";
      const bucket = props["data-make-styles-bucket"]
        ? ` data-make-styles-bucket="${props["data-make-styles-bucket"]}"`
        : "";
      const prio = props["data-priority"]
        ? ` data-priority="${props["data-priority"]}"`
        : "";
      return `<style${bucket}${prio}>${css}</style>`;
    })
    .join("");

  const initialPayload = {
    queryState: dehydrate(queryClient),
    auth: opts.auth ?? null,
    locale: opts.locale ?? null,
  };
  // Escape `</` to keep the JSON safe inside a <script> tag.
  const initialJson = JSON.stringify(initialPayload).replace(/</g, "\\u003c");
  const initialScript = `<script>window.__INITIAL__=${initialJson}</script>`;

  const body = opts.template
    .replace("<!--app-head-->", styleHtml)
    .replace("<!--app-html-->", appHtml)
    .replace("<!--app-state-->", initialScript);

  return {
    status: matchedNotFound ? 404 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body,
  };
}
