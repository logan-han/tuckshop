import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearSession, loadSession, type Session } from './api/auth';
import { describeError, needsSignIn } from './api/errors';
import {
  getAvailableServices,
  getOrderFee,
  getOrderHistory,
  getStudents,
  getWallet,
} from './api/flexischools';
import type { AvailableService, Student, StudentService, Wallet } from './api/types';
import CheckStep from './components/CheckStep';
import DoneStep from './components/DoneStep';
import LunchBag from './components/LunchBag';
import Masthead, { type View } from './components/Masthead';
import SignIn from './components/SignIn';
import UpcomingOrders from './components/UpcomingOrders';
import WhatStep from './components/WhatStep';
import WhenStep from './components/WhenStep';
import WhoStep from './components/WhoStep';
import { existingOrdersByDate, type ExistingOrders, type OrderOutcome } from './engine/orders';
import { bagFor, EMPTY_BAGS, setBag, type Bags } from './engine/selections';
import { presetsFor, todayIso } from './engine/schedule';
import { loadPlan, planDates, retargetPlan, savePlan, skipDate, type Plan } from './state/plan';

type Step = 'who' | 'when' | 'what' | 'check' | 'done';

const NO_ORDERS: ExistingOrders = new Map();

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<View>('plan');
  const [students, setStudents] = useState<Student[] | null>(null);
  const [available, setAvailable] = useState<AvailableService[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [service, setService] = useState<StudentService | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan>(() => loadPlan(todayIso()));
  const [bags, setBags] = useState<Bags>(EMPTY_BAGS);
  /** Live orders already placed for the planned range, by date. */
  const [existing, setExisting] = useState<ExistingOrders>(NO_ORDERS);
  const [ordersEpoch, setOrdersEpoch] = useState(0);
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
    setBags(EMPTY_BAGS);
    setExisting(NO_ORDERS);
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

  const refreshWallet = useCallback(
    () => getWallet().then(setWallet).catch(handleError),
    [handleError],
  );

  /** After orders are placed or cancelled: the wallet and the list of existing orders both moved. */
  const refreshAccount = useCallback(() => {
    refreshWallet();
    setOrdersEpoch((n) => n + 1);
  }, [refreshWallet]);

  /** Selecting a student also points the plan at a term their school actually has. */
  const chooseStudent = useCallback((s: Student, svc: StudentService) => {
    setStudent(s);
    setService(svc);
    setBags(EMPTY_BAGS);
    setExisting(NO_ORDERS);
    setPlan((current) => {
      const next = retargetPlan(current, todayIso(), s.schoolName);
      if (next !== current) savePlan(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([getStudents(), getWallet()])
      .then(async ([list, walletInfo]) => {
        const listed = list.filter((s) => s.services.length > 0);
        // Flexischools leaves finished one-off event services attached to the student, so keep
        // only the services the canteen is actually taking orders for.
        const open = await getAvailableServices(listed).catch(() => null);
        if (cancelled) return;
        const withFood = open
          ? listed
              .map((s) => ({
                ...s,
                services: s.services.filter((svc) =>
                  open.some((a) => a.supplierServiceKey === svc.supplierServiceKey),
                ),
              }))
              .filter((s) => s.services.length > 0)
          : listed;
        setAvailable(open ?? []);
        setStudents(withFood);
        setWallet(walletInfo);
        if (withFood.length === 1) {
          // One child: pick them and their everyday service; only stop here if there is a
          // second service worth choosing.
          chooseStudent(withFood[0], withFood[0].services[0]);
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
  }, [session, handleError, chooseStudent]);

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

  // Top-ups happen in Flexischools, usually in another tab, so read the wallet again on return.
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshWallet();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session, refreshWallet]);

  // Each step starts at the top; on a phone the button that got you here sits far down the page.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [step, view]);

  const today = todayIso();
  const dates = useMemo(() => planDates(plan, today), [plan, today]);

  // What is already ordered for the planned range, so the earlier steps can point it out. The
  // check step fetches again right before placing anything.
  const historyTo = plan.to >= today ? plan.to : today;
  useEffect(() => {
    if (!student || !service) return;
    let cancelled = false;
    getOrderHistory({ fromDate: today, toDate: historyTo, pageSize: 200 })
      .then((history) => {
        if (cancelled) return;
        setExisting(existingOrdersByDate(history, student.studentKey, service.supplierServiceKey));
      })
      .catch((error) => {
        if (!cancelled) handleError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [student, service, today, historyTo, ordersEpoch, handleError]);

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
        <UpcomingOrders onError={handleError} onChanged={refreshAccount} />
      ) : (
        <div className="layout">
          <div className="layout__main">
            {students === null && !banner && (
              <p className="hint">Loading your Flexischools account…</p>
            )}

            {students !== null && step === 'who' && (
              <WhoStep
                students={students}
                available={available}
                student={student}
                service={service}
                wallet={wallet}
                onChoose={chooseStudent}
                onContinue={() => setStep('when')}
              />
            )}

            {step === 'when' && (
              <WhenStep
                plan={plan}
                presets={presetsFor(student?.schoolName)}
                dates={dates}
                existing={existing}
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
                bags={bags}
                existing={existing}
                onChange={setBags}
                onSkipDate={(date) => updatePlan(skipDate(plan, date))}
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
                bags={bags}
                feePerOrder={fee}
                wallet={wallet}
                onRefreshWallet={refreshWallet}
                onBack={() => setStep('what')}
                onPlaced={(result) => {
                  setOutcomes(result);
                  setStep('done');
                  refreshAccount();
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
                  setBags(EMPTY_BAGS);
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
              dates={dates}
              bags={bags}
              feePerOrder={fee}
              onRemove={
                step === 'what'
                  ? (ref, index) =>
                      setBags(
                        setBag(
                          bags,
                          ref,
                          bagFor(bags, ref).filter((_, i) => i !== index),
                        ),
                      )
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
