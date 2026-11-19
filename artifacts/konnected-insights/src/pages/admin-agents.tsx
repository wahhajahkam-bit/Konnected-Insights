import React, { useState } from 'react';
import { Navbar } from '@/components/navbar';
import { Metadata } from '@/components/metadata';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { useEditorialAccess } from '@/hooks/use-access';
import { ShieldCheck, Search, Telescope, Mail, UserCog, LogOut, Activity, Lock } from 'lucide-react';
import { StaffManagementDialog } from './admin-components/staff-management-dialog';
import { AgentInventory } from './admin-components/agent-inventory';
import { AgentMonitoring } from './admin-components/agent-monitoring';

export default function AdminAgents() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: access } = useEditorialAccess();
  const canManageStaff = access?.canManageStaff ?? false;

  const [activeTab, setActiveTab] = useState<'inventory' | 'website' | 'replit'>('inventory');

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground">
      <Metadata title="Agent Monitoring | Admin" />
      <div className="noise-overlay" />
      <Navbar alwaysDark />

      <main className="flex-grow pt-24 flex flex-col container mx-auto px-4 md:px-6 max-w-screen-2xl mb-12">
        <div className="mb-6 p-4 border border-primary/20 bg-primary/5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">Secured Staff Session</p>
              <p className="text-muted-foreground text-xs">{user?.primaryEmailAddress?.emailAddress || 'Authenticated Staff Member'}</p>
            </div>
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin">
                <Lock className="mr-2 h-3.5 w-3.5" />
                Desk
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/research" data-testid="link-admin-research">
                <Search className="mr-2 h-3.5 w-3.5" />
                Future of Work Research
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/future-work" data-testid="link-admin-future-work">
                <Telescope className="mr-2 h-3.5 w-3.5" />
                Future of Work
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/automation">
                <Mail className="mr-2 h-3.5 w-3.5" />
                Automation
              </Link>
            </Button>
            {canManageStaff && (
              <StaffManagementDialog>
                <Button variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
                  <UserCog className="mr-2 h-3.5 w-3.5" />
                  Manage Staff
                </Button>
              </StaffManagementDialog>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
              className="h-8 text-xs uppercase tracking-widest bg-primary/20 text-primary hover:bg-primary/30 border-transparent shadow-none"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2 pb-4 border-b border-border/50">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`text-xs uppercase tracking-widest px-4 py-2 border transition-all ${
                activeTab === 'inventory'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/50 text-muted-foreground hover:border-primary/50'
              }`}
            >
              Inventory & Health
            </button>
            <button
              onClick={() => setActiveTab('website')}
              className={`text-xs uppercase tracking-widest px-4 py-2 border transition-all ${
                activeTab === 'website'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/50 text-muted-foreground hover:border-primary/50'
              }`}
            >
              Website Agents
            </button>
            <button
              onClick={() => setActiveTab('replit')}
              className={`text-xs uppercase tracking-widest px-4 py-2 border transition-all flex items-center gap-2 ${
                activeTab === 'replit'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/50 text-muted-foreground hover:border-primary/50'
              }`}
            >
              Replit Agents <Activity className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-card/50 backdrop-blur-md border border-border p-6 rounded-sm shadow-2xl min-h-[500px]">
            {activeTab === 'inventory' && <AgentInventory />}
            {activeTab === 'website' && <AgentMonitoring category="website" />}
            {activeTab === 'replit' && <AgentMonitoring category="replit" />}
          </div>
        </div>
      </main>
    </div>
  );
}
