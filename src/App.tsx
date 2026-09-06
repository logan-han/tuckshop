import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearSession, loadSession, type Session } from './api/auth';
import { describeError, needsSignIn } from './api/errors';
import { getOrderFee, getStudents, getWallet } from './api/flexischools';
import type { Student, StudentService, Wallet } from './api/types';
import CheckStep from './components/CheckStep';
import DoneStep from './components/DoneStep';
import LunchBag from './components/LunchBag';
import Masthead, { type View } from './components/Masthead';
import SignIn from './components/SignIn';
import UpcomingOrders from './components/UpcomingOrders';
import WhatStep from './components/WhatStep';
import WhenStep from './components/WhenStep';
import WhoStep from './components/WhoStep';
import type { OrderOutcome } from './engine/orders';
import type { Selection } from './engine/pricing';
import { todayIso } from './engine/schedule';
import { loadPlan, planDates, savePlan, type Plan } from './state/plan';

type Step = 'who' | 'when' | 'what' | 'check' | 'done';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<View>('plan');
  const [students, setStudents] = useState<Student[] | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [service, setService] = useState<StudentService | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan>(() => loadPlan(todayIso()));
  const [selections, setSelections] = useState<Selection[]>([]);
  const [step, setStep] = useState<Step>('who');
  const [outcomes, setOutcomes] = useState<OrderOutcome[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const signOut = useCallback((message: string | null = null) => {
    clearSession();
    setSession(null);
    setStudents(null);
    setWallet(null);
    setStudent(null);
    setService(null);
    setFee(null);
    setSelections([]);
    setStep('who');
    setView('plan');
    setBanner(message);
  }, []);

  /** Shared failure path: anything that means "sign in again" signs out, the rest is left to the caller. */
  const handleError = useCallback(
    (error: unknown) => {
      if (needsSignIn(error)) signOut(describeError(error));
    },
    [signOut],
  );

  const refreshWallet = useCallback(() => {
    getWallet().then(setWallet).catch(handleError);
  }, [handleError]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([getStudents(), getWallet()])
      .then(([list, walletInfo]) => {
        if (cancelled) return;
        const withFood = list.filter((s) => s.services.length > 0);
        setStudents(withFood);
        setWallet(walletInfo);
        if (withFood.length === 1) {
          // One child: pick them and their everyday service; only stop here if there is a
          // second service worth choosing.
          setStudent(withFood[0]);
          setService(withFood[0].services[0]);
          if (withFood[0].services.length === 1) setStep('when');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        handleError(error);
        setBanner(describeError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [session, handleError]);

  useEffect(() => {
    if (!student || !service) return;
    let cancelled = false;
    getOrderFee(student.studentKey, service.supplierServiceKey)
      .then((result) => {
        if (!cancelled) setFee(result.fee);
      })
      .catch(handleError);
    return () => {
      cancelled = true;
    };
  }, [student, service, handleError]);

  const today = todayIso();
  const dates = useMemo(() => planDates(plan, today), [plan, today]);

  function updatePlan(next: Plan) {
    setPlan(next);
    savePlan(next);
  }

  if (!session) {
    return (
      <div className="shell">
        <Masthead session={null} view={view} onView={setView} onSignOut={() => signOut()} />
        {banner && (
          <p className="notice notice--warn" role="status">
            {banner}
          </p>
        )}
        <SignIn
          onSignedIn={(s) => {
            setBanner(null);
            setSession(s);
          }}
        />
        <Footnote />
      </div>
    );
  }

  return (
    <div className="shell">
      <Masthead session={session} view={view} onView={setView} onSignOut={() => signOut()} />
      {banner && (
        <p className="notice notice--bad" role="alert">
          {banner}
        </p>
      )}

      {view === 'orders' ? (
        <UpcomingOrders onError={handleError} onChanged={refreshWallet} />
      ) : (
        <div className="layout">
          <div className="layout__main">
            {students === null && !banner && (
              <p className="hint">Loading your Flexischools account…</p>
            )}

            {students !== null && step === 'who' && (
              <WhoStep
                students={students}
                student={student}
                service={service}
                wallet={wallet}
                onChoose={(s, svc) => {
                  setStudent(s);
                  setService(svc);
                  setSelections([]);
                }}
                onContinue={() => setStep('when')}
              />
            )}

            {step === 'when' && (
              <WhenStep
                plan={plan}
                dates={dates}
                onChange={updatePlan}
                onBack={() => setStep('who')}
                onContinue={() => setStep('what')}
              />
            )}

            {step === 'what' && student && service && (
              <WhatStep
                student={student}
                service={service}
                dates={dates}
                selections={selections}
                onChange={setSelections}
                onBack={() => setStep('when')}
                onContinue={() => setStep('check')}
                onError={handleError}
              />
            )}

            {step === 'check' && student && service && fee !== null && (
              <CheckStep
                student={student}
                service={service}
                dates={dates}
                selections={selections}
                feePerOrder={fee}
                wallet={wallet}
                onBack={() => setStep('what')}
                onPlaced={(result) => {
                  setOutcomes(result);
                  setStep('done');
                  refreshWallet();
                }}
                onError={handleError}
              />
            )}
            {step === 'check' && fee === null && <p className="hint">Loading order fees…</p>}

            {step === 'done' && (
              <DoneStep
                studentName={student?.studentFirstName ?? 'your student'}
                outcomes={outcomes}
                onPlanAnother={() => {
                  setSelections([]);
                  setStep('when');
                }}
                onShowOrders={() => setView('orders')}
              />
            )}
          </div>
          <div className="layout__aside">
            <LunchBag
              student={student}
              service={service}
              weekdays={plan.weekdays}
              dateCount={dates.length}
              selections={selections}
              feePerOrder={fee}
              onRemove={
                step === 'what'
                  ? (index) => setSelections(selections.filter((_, i) => i !== index))
                  : undefined
              }
            />
          </div>
        </div>
      )}
      <Footnote />
    </div>
  );
}

function Footnote() {
  return (
    <p className="footnote">
      Tuckshop is an independent helper and is not affiliated with Flexischools. It talks to the
      same services their website does, from your browser, using your own account.
    </p>
  );
}
