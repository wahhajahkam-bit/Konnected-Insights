import React, { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const passes = [
  {
    id: 'individual',
    name: 'Individual',
    price: '$295',
    desc: 'Full digital access to all 7 days of programming and 50+ sessions.',
    features: ['Live session streams', 'On-demand recordings', 'Digital networking', 'Interactive Q&A access']
  },
  {
    id: 'event-pass',
    name: 'Event Pass',
    price: '$895',
    desc: 'The complete experience. Priority access and executive workshops.',
    features: ['Everything in Individual', 'Executive workshops', 'Curated matchmaking', '1-on-1 speaker sessions', 'Post-event insights report'],
    popular: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    desc: 'Team access for organizations driving exponential change.',
    features: ['Up to 10 Event Passes', 'Private corporate briefing', 'Brand acknowledgment', 'Dedicated concierge', 'Bespoke insights session']
  }
];

export function RegistrationDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedPass, setSelectedPass] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const reset = () => {
    setStep(1);
    setSelectedPass(null);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) setTimeout(reset, 300);
    }}>
      <DialogPrimitive.Trigger asChild>
        {children}
      </DialogPrimitive.Trigger>

      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed left-[50%] top-[50%] z-50 w-full max-w-5xl translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 focus:outline-none"
              >
                <div className="glass-card relative flex flex-col max-h-[90dvh] overflow-y-auto overflow-x-hidden rounded-2xl bg-background/90 p-6 md:p-12">

                  <DialogPrimitive.Close className="absolute right-4 top-4 md:right-6 md:top-6 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary z-10">
                    <X className="h-5 w-5" />
                  </DialogPrimitive.Close>

                  {step === 1 ? (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex flex-col h-full relative z-0"
                    >
                      <div className="mb-10 text-center pt-4 md:pt-0">
                        <h2 className="text-3xl md:text-5xl font-display font-bold text-white tracking-tight">Experience the Power of Together</h2>
                        <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">Join ambitious leaders, founders, investors, and operators in the Middle East and beyond.</p>
                      </div>

                      <div className="grid gap-6 md:grid-cols-3">
                        {passes.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setSelectedPass(p.id)}
                            className={cn(
                              "relative text-left w-full cursor-pointer rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              selectedPass === p.id
                                ? "border-primary bg-primary/10 shadow-[0_0_40px_rgba(14,165,233,0.15)]"
                                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                            )}
                          >
                            {p.popular && (
                              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground tracking-wider uppercase whitespace-nowrap">
                                Recommended
                              </div>
                            )}
                            <div className="mb-6">
                              <h3 className="text-2xl font-display font-bold">{p.name}</h3>
                              <div className="mt-4 text-4xl font-display font-bold tracking-tight">{p.price}</div>
                              <p className="mt-4 text-sm text-white/60 leading-relaxed min-h-[60px]">{p.desc}</p>
                            </div>
                            <div className="mb-8 space-y-4">
                              {p.features.map((f, i) => (
                                <div key={i} className="flex items-start gap-3 text-sm text-white/80">
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                  <span className="leading-tight">{f}</span>
                                </div>
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="mt-10 flex justify-center pb-4 md:pb-0">
                        <Button
                          size="lg"
                          disabled={!selectedPass}
                          onClick={() => setStep(2)}
                          className="w-full md:w-auto h-14 px-10 text-lg gap-2 glow-effect"
                        >
                          Continue to Details
                          <ArrowRight className="h-5 w-5" />
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex flex-col h-full items-center justify-center py-16 text-center"
                    >
                      <div className="mb-8 rounded-full bg-primary/20 p-5 text-primary">
                        <Check className="h-16 w-16" />
                      </div>
                      <h2 className="text-4xl font-display font-bold text-white tracking-tight">Pathway Selected</h2>
                      <p className="mt-6 text-xl text-white/60 max-w-lg leading-relaxed">
                        You have chosen the <strong className="text-white">{passes.find(p => p.id === selectedPass)?.name}</strong> pathway. Please proceed to the official Konsälidön contact portal to submit your request and secure your access.
                      </p>
                      <Button
                        size="lg"
                        className="mt-12 h-14 px-10 text-lg bg-white text-black hover:bg-white/90 gap-2"
                        asChild
                      >
                        <a href="https://konsalidon.com/contact" target="_blank" rel="noopener noreferrer">
                          Complete on Konsälidön
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      </Button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}