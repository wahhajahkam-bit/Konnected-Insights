import { useClerk, useUser } from '@clerk/react';
import { AlertTriangle, ArrowLeft, Linkedin, LogOut, Mail, Settings2, ShieldCheck } from 'lucide-react';
import { Link, useSearch } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Metadata } from '@/components/metadata';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEditorialAccess } from '@/hooks/use-access';
import NewsletterSources from './admin-newsletter-sources';
import { AutomationRulesSection } from './admin-components/automation-rules-section';
import { confirmUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { LinkedInAutomationSection } from './admin-components/linkedin-automation-section';

type AutomationSection = 'rules' | 'email-sources' | 'linkedin';

const isAutomationSection = (value: string | null): value is AutomationSection =>
  value === 'rules' || value === 'email-sources' || value === 'linkedin';

export default function AdminAutomation() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: access, isLoading: isAccessLoading } = useEditorialAccess();
  const search = useSearch();
  const requestedSection = new URLSearchParams(search).get('section');
  const canManageStaff = access?.canManageStaff ?? false;
  const section: AutomationSection = isAutomationSection(requestedSection)
    ? requestedSection
    : canManageStaff
      ? 'rules'
      : 'email-sources';

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground">
      <Metadata title="Automation Hub | Admin" />
      <div className="noise-overlay" />
      <Navbar alwaysDark />

      <main className="flex-grow pt-24 flex flex-col container mx-auto px-4 md:px-6 max-w-screen-2xl mb-12">
        <div className="mb-6 p-4 border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">Automation Hub</p>
              <p className="text-muted-foreground text-xs">{user?.primaryEmailAddress?.emailAddress || 'Authenticated Staff Member'}</p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                Back to Desk
              </Link>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                if (confirmUnsavedChanges()) signOut({ redirectUrl: import.meta.env.BASE_URL });
              }}
              className="h-8 text-xs uppercase tracking-widest bg-primary/20 text-primary hover:bg-primary/30 border-transparent shadow-none"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="mb-6 border border-border bg-card/50 rounded-sm p-2 flex flex-col md:flex-row gap-2">
          {canManageStaff && (
            <SectionLink section="rules" active={section === 'rules'} icon={<Settings2 className="w-4 h-4" />} title="Automation rules" description="Configurable draft or automatic publishing" />
          )}
          <SectionLink section="email-sources" active={section === 'email-sources'} icon={<Mail className="w-4 h-4" />} title="Email Newsletter Sources" description="Draft-only newsletter intake" />
          <SectionLink section="linkedin" active={section === 'linkedin'} icon={<Linkedin className="w-4 h-4" />} title="LinkedIn Intake" description="Draft-only newsletter intake" />
        </div>

        {isAccessLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full opacity-20 rounded-sm" />
            <Skeleton className="h-64 w-full opacity-20 rounded-sm" />
          </div>
        ) : section === 'rules' ? (
          canManageStaff ? (
            <AutomationRulesSection />
          ) : (
            <div className="p-10 border border-amber-500/30 bg-amber-500/5 rounded-sm text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-4" />
              <h2 className="font-display text-xl">Administrator access required</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
                Publishing rules can create or publish content automatically and are restricted to administrators. Editors can manage draft-only email and LinkedIn sources.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5 text-xs uppercase tracking-widest">
                <Link href="/admin/automation?section=email-sources">View email sources</Link>
              </Button>
            </div>
          )
        ) : section === 'email-sources' ? (
          <NewsletterSources embedded />
        ) : (
          <LinkedInAutomationSection />
        )}
      </main>
    </div>
  );
}

function SectionLink({
  section,
  active,
  icon,
  title,
  description,
}: {
  section: AutomationSection;
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={`/admin/automation?section=${section}`}
      aria-current={active ? 'page' : undefined}
      className={`flex-1 flex items-start gap-3 p-3 rounded-sm border transition-colors ${
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-background/50'
      }`}
    >
      <span className={active ? 'text-primary mt-0.5' : 'mt-0.5'}>{icon}</span>
      <span>
        <span className="block text-xs uppercase tracking-widest font-medium">{title}</span>
        <span className="block text-[11px] mt-1 normal-case tracking-normal">{description}</span>
      </span>
    </Link>
  );
}