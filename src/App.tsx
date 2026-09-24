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
import {
  batchOwner,
  existingOrdersByDate,
  type ExistingOrders,
  type OrderOutcome,
  type PendingBatch,
} from './engine/orders';
import { bagFor, EMPTY_BAGS, setBag, type Bags } from './engine/selections';
import { presetsFor, todayIso } from './engine/schedule';
import { clearDraft, holdsFood, loadDraft, saveDraft } from './state/draft';
import { loadPlan, planDates, retargetPlan, savePlan, skipDate, type Plan } from './state/plan';

type Step = 'who' | 'when' | 'what' | 'check' | 'done';

const NO_ORDERS: ExistingOrders = new Map();
const NO_DATES: ReadonlySet<string> = new Set();

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
  /** Planned dates the canteen calendar says cannot be ordered for, as step 3 last read it. */
  const [closed, setClosed] = useState<ReadonlySet<string>>(NO_DATES);
  /**
   * Dates sent in carts that got no answer, per child and service. Kept here, past Back, a
   * switch to another child and a session that lapses mid order, so resending them reuses their
   * keys and cannot place them twice.
   */
  const [pending, setPending] = useState<Record<string, PendingBatch>>({});
  const [ordersEpoch, setOrdersEpoch] = useState(0);
  const [step, setStep] = useState<Step>('who');
  const [outcomes, setOutcomes] = useState<OrderOutcome[]>([]);
  /** A date step 3 opens on, after "Fix" on a date Flexischools declined. */
  const [fixDate, setFixDate] = useState<string | undefined>(undefined);
  const [banner, setBanner] = useState<string | null>(null);

  const signOut = useCallback((message: string | null = null) => {
    // Signing out on purpose drops the bag; a session that lapsed keeps it for signing back in.
    if (message === null) clearDraft();
    clearSession();
    setFixDate(undefined);
    setSession(null);
    setStudents(null);
    setWallet(null);
    setStudent(null);
    setService(null);
    setFee(null);
    setBags(EMPTY_BAGS);
    setExisting(NO_ORDERS);
    setClosed(NO_DATES);
    setStep('who');
    setView('plan');
    setBanner(message);
  }, []);

  const noteClosed = useCallback((dates: string[]) => setClosed(new Set(dates)), []);

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
    setClosed(NO_DATES);
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
        // Back after a reload, or signing in again after the session lapsed: same bag, same step.
        const draft = loadDraft(Date.now());
        const resumed = draft
          ? withFood
              .flatMap((s) => s.services.map((svc) => ({ s, svc })))
              .find(({ s, svc }) => batchOwner(s, svc) === draft.owner)
          : undefined;
        if (draft && resumed) {
          chooseStudent(resumed.s, resumed.svc);
          setBags(draft.bags);
          setStep(draft.step);
        } else if (withFood.length === 1) {
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

  // The bag is kept for the tab until it is placed. Nothing is written before the students load,
  // so the empty bag of a page just reloaded cannot wipe the draft it is about to pick up.
  useEffect(() => {
    if (students === null) return;
    if (student && service && step !== 'done' && holdsFood(bags)) {
      saveDraft({ owner: batchOwner(student, service), bags, step, savedAt: Date.now() });
    } else {
      clearDraft();
    }
  }, [students, student, service, bags, step]);

  // Each step starts at the top; on a phone the button that got you here sits far down the page.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [step, view]);

  const today = todayIso();
  const dates = useMemo(() => planDates(plan, today), [plan, today]);
  // What the check will start ticked, so the bag's total is the one the check arrives at.
  const toOrder = useMemo(
    () => dates.filter((date) => !existing.has(date) && !closed.has(date)),
    [dates, existing, closed],
  );

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
        <UpcomingOrders
          oneChild={students?.length === 1}
          onError={handleError}
          onChanged={refreshAccount}
        />
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
                onClosed={noteClosed}
                initialDate={fixDate}
                onBack={() => {
                  setFixDate(undefined);
                  setStep('when');
                }}
                onContinue={() => {
                  setFixDate(undefined);
                  setStep('check');
                }}
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
                pending={pending[batchOwner(student, service)] ?? null}
                onPending={(next) =>
                  setPending((current) => {
                    const held = { ...current };
                    if (next) held[next.owner] = next;
                    else delete held[batchOwner(student, service)];
                    return held;
                  })
                }
                onOrdersChanged={refreshAccount}
              />
            )}
            {step === 'check' && fee === null && <p className="hint">Loading order fees…</p>}

            {step === 'done' && (
              <DoneStep
                studentName={student?.studentFirstName ?? 'your student'}
                outcomes={outcomes}
                otherStudents={(students ?? []).filter((s) => s.studentKey !== student?.studentKey)}
                onPlanAnother={() => {
                  setBags(EMPTY_BAGS);
                  setStep('when');
                }}
                onShowOrders={() => setView('orders')}
                // The bag stays as it was; the dates that went in now show as already ordered.
                onFix={(date) => {
                  setFixDate(date);
                  setStep('what');
                }}
                onOrderFor={(other) => {
                  chooseStudent(other, other.services[0]);
                  setStep(other.services.length > 1 ? 'who' : 'when');
                }}
              />
            )}
          </div>
          {/* Once placed, the outcome list is the record; the plan's bag would only disagree with it. */}
          {step !== 'done' && (
            <div className="layout__aside">
              <LunchBag
                student={student}
                service={service}
                weekdays={plan.weekdays}
                dates={dates}
                bags={bags}
                feePerOrder={fee}
                toOrder={toOrder}
                costing={step !== 'check'}
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
          )}
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
