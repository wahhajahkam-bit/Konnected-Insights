import { useEffect, useRef, type ReactNode } from 'react';
import '@/hooks/use-unsaved-changes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollToTop } from '@/components/scroll-to-top';

import { ClerkProvider, SignIn, SignUp, Show, useClerk, UserButton } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { useEditorialAccess } from '@/hooks/use-access';

// Pages
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import BiggerPicture from '@/pages/bigger-picture';
import Newsletters from '@/pages/newsletters';
import MasterclassSeries from '@/pages/masterclass-series';
import MasterclassDetail from '@/pages/masterclass-detail';
import FutureOfWork from '@/pages/future-of-work';
import FutureOfWorkFunction from '@/pages/future-of-work-function';
import Contributors from '@/pages/contributors';
import ContributorDetail from '@/pages/contributor-detail';
import Communities from '@/pages/communities';
import Events from '@/pages/events';
import EventDetail from '@/pages/event-detail';
import Talks from '@/pages/talks';
import Admin from '@/pages/admin';
import AdminAutomation from '@/pages/admin-automation';
import AdminFutureWork from '@/pages/admin-future-work';
import AdminResearch from '@/pages/admin-research';

import AdminAgents from '@/pages/admin-agents';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
  Link,
} from 'wouter';
import { VisitorInsightsChat } from '@/components/visitor-insights-chat';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const artifactPreviewPath = "/konnected-insights";
const basePath =
  configuredBasePath ||
  (window.location.pathname === artifactPreviewPath ||
  window.location.pathname.startsWith(`${artifactPreviewPath}/`)
    ? artifactPreviewPath
    : "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#C8B08A",
    colorForeground: "#F4F3EF",
    colorMutedForeground: "rgba(244, 243, 239, 0.5)",
    colorBackground: "#0F0F16",
    colorInput: "rgba(244, 243, 239, 0.15)",
    colorInputForeground: "#F4F3EF",
    colorDanger: "#EF4444",
    colorNeutral: "rgba(244, 243, 239, 0.1)",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0F0F16] rounded-none w-[440px] max-w-full overflow-hidden editorial-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-display text-2xl font-normal tracking-tight text-[#F4F3EF]",
    headerSubtitle: "text-[rgba(244,243,239,0.5)] text-sm",
    socialButtonsBlockButtonText: "text-[#F4F3EF] font-medium",
    formFieldLabel: "text-[#F4F3EF] font-medium",
    footerActionLink: "text-[#C8B08A] hover:text-[#EEDC9A]",
    footerActionText: "text-[rgba(244,243,239,0.5)]",
    dividerText: "text-[rgba(244,243,239,0.5)]",
    identityPreviewEditButton: "text-[#C8B08A]",
    formFieldSuccessText: "text-[#10B981]",
    alertText: "text-[#EF4444]",
    formButtonPrimary: "bg-[#C8B08A] hover:bg-[#EEDC9A] text-[#0A0B10] !shadow-none rounded-none transition-colors",
    formFieldInput: "bg-[rgba(244,243,239,0.05)] border-[rgba(244,243,239,0.1)] text-[#F4F3EF] rounded-none focus:border-[#C8B08A] focus:ring-1 focus:ring-[#C8B08A]",
    socialButtonsBlockButton: "border-[rgba(244,243,239,0.1)] bg-[rgba(244,243,239,0.02)] hover:bg-[rgba(244,243,239,0.05)] rounded-none",
    dividerLine: "bg-[rgba(244,243,239,0.1)]",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 cinematic-vignette">
      <SignIn routing="path" path={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/admin`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 cinematic-vignette">
      <SignUp routing="path" path={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/admin`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function AdminWithAccessCheck({ children }: { children?: ReactNode }) {
  const { data: access, isLoading, isError } = useEditorialAccess();

  if (isLoading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex flex-col items-center justify-center cinematic-vignette">
        <div className="flex flex-col items-center gap-6">
           <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
           <p className="text-muted-foreground uppercase tracking-widest text-xs">Verifying Access...</p>
        </div>
      </div>
    );
  }

  if (isError || !access?.allowed) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex flex-col items-center justify-center cinematic-vignette px-4">
        <div className="max-w-md w-full bg-card/50 backdrop-blur-md border border-border p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8 text-destructive opacity-80" />
          </div>
          <h1 className="text-2xl font-display mb-2 text-foreground">Access Restricted</h1>
          <p className="text-muted-foreground mb-8">
            Your account has not been approved for editorial access. Please contact an administrator if you believe this is an error.
          </p>
          <div className="flex flex-col gap-4 w-full">
            <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-none h-12 uppercase tracking-widest text-xs">
              <Link href="/">Return to Home</Link>
            </Button>
            <div className="flex justify-center pt-4 border-t border-border mt-2">
              <UserButton
                appearance={{
                  elements: {
                    userButtonBox: "flex-row-reverse",
                    userButtonOuterIdentifier: "text-muted-foreground text-xs uppercase tracking-widest",
                  }
                }}
                showName
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return children ?? <Admin />;
}

function ProtectedAdminAutomation() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck><AdminAutomation /></AdminWithAccessCheck>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedAdmin() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedNewsletterSources() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck>
          <Redirect to="/admin/automation?section=email-sources" replace />
        </AdminWithAccessCheck>
      </Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function ProtectedAdminFutureWork() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck><AdminFutureWork /></AdminWithAccessCheck>
      </Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function ProtectedAdminResearch() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck><AdminResearch /></AdminWithAccessCheck>
      </Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function ProtectedAdminAgents() {
  return (
    <>
      <Show when="signed-in">
        <AdminWithAccessCheck><AdminAgents /></AdminWithAccessCheck>
      </Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function Router() {
  const [location] = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <RoutedErrorBoundary>
      <ScrollToTop />
      <motion.div
        key={location}
        initial={reduceMotion ? false : { opacity: 0.86 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
      >
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/bigger-picture" component={BiggerPicture} />
          <Route path="/newsletters" component={Newsletters} />
          <Route path="/masterclass-series" component={MasterclassSeries} />
          <Route path="/masterclass-series/:slug" component={MasterclassDetail} />
          <Route path="/future-of-work" component={FutureOfWork} />
          <Route path="/future-of-work/:function" component={FutureOfWorkFunction} />
          <Route path="/contributors" component={Contributors} />
          <Route path="/contributors/:slug" component={ContributorDetail} />
          <Route path="/communities" component={Communities} />
          <Route path="/events" component={Events} />
          <Route path="/events/:slug" component={EventDetail} />
          <Route path="/talks" component={Talks} />
          <Route path="/admin" component={ProtectedAdmin} />
          <Route path="/admin/automation" component={ProtectedAdminAutomation} />
          <Route path="/admin/agents" component={ProtectedAdminAgents} />
          <Route path="/admin/newsletter-sources" component={ProtectedNewsletterSources} />
          <Route path="/admin/future-work" component={ProtectedAdminFutureWork} />
          <Route path="/admin/research" component={ProtectedAdminResearch} />
          <Route path="/sign-in" component={SignInPage} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up" component={SignUpPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Staff Access",
            subtitle: "Sign in to manage editorial content",
          },
        },
        signUp: {
          start: {
            title: "Join the Editorial Team",
            subtitle: "Accept your invitation and create your secure account",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <VisitorInsightsChat />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
