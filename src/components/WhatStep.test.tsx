import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiError, getFulfillmentDates, getMenu } from '../api/flexischools';
import type { FulfillmentDate } from '../api/types';
import { addDays } from '../engine/schedule';
import { EMPTY_BAGS, type Bags } from '../engine/selections';
import {
  FRIDAY,
  lunch,
  makeCategory,
  makeFulfilment,
  makeHistoryOrder,
  makeItem,
  makeMenu,
  makeOptionSet,
  makeSelection,
  student,
  sushi,
  tenders,
  THURSDAYS,
} from '../test/fixtures';
import WhatStep from './WhatStep';

vi.mock('../api/flexischools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/flexischools')>()),
  getFulfillmentDates: vi.fn(),
  getMenu: vi.fn(),
}));

const fulfilments = vi.mocked(getFulfillmentDates);
const menu = vi.mocked(getMenu);

/** What the canteen calendar says about a date; null means it does not list it at all. */
let calendar: (date: string) => FulfillmentDate | null;

type Props = Parameters<typeof WhatStep>[0];

/** WhatStep is controlled, so the bag it is given has to move as the tests change it. */
function renderStep(overrides: Partial<Props> = {}) {
  const spies = {
    onChange: vi.fn(),
    onSkipDate: vi.fn(),
    onBack: vi.fn(),
    onContinue: vi.fn(),
    onError: vi.fn(),
  };

  function Harness() {
    const [bags, setBags] = useState<Bags>(overrides.bags ?? EMPTY_BAGS);
    return (
      <WhatStep
        student={student}
        service={lunch}
        dates={THURSDAYS}
        existing={new Map()}
        {...overrides}
        bags={bags}
        onChange={(next) => {
          spies.onChange(next);
          setBags(next);
        }}
        onSkipDate={spies.onSkipDate}
        onBack={spies.onBack}
        onContinue={spies.onContinue}
        onError={spies.onError}
      />
    );
  }

  render(<Harness />);
  return spies;
}

beforeEach(() => {
  fulfilments.mockReset();
  menu.mockReset();
  calendar = (date) => makeFulfilment(date);
  fulfilments.mockImplementation((_student, _service, monday) =>
    Promise.resolve(
      Array.from({ length: 5 }, (_, i) => calendar(addDays(monday, i))).flatMap((entry) =>
        entry ? [entry] : [],
      ),
    ),
  );
  menu.mockResolvedValue(makeMenu());
});

describe('WhatStep', () => {
  it('waits for the calendar, then shows the menu for the first date of the weekday', async () => {
    renderStep();
    expect(screen.getByText('Checking the canteen calendar…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Hot Food' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chicken Tenders \(2\) \$4\.90/ })).toBeEnabled();
    expect(
      screen.getByText(/Showing the Lunch menu for Thu 8 Oct, the first Thursday/),
    ).toBeVisible();
    expect(menu).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-10-08T12:40:00', schoolKey: 'school-1' }),
    );
    // Three Thursdays in one plan, so the menu is only fetched for the one being shown.
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it('puts a chosen item in the weekday bag and badges it on the menu', async () => {
    const user = userEvent.setup();
    const { onChange, onContinue } = renderStep();

    await screen.findByRole('heading', { name: 'Hot Food' });
    expect(screen.getByRole('button', { name: 'Check every date' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));

    expect(onChange).toHaveBeenCalledWith({
      byDay: { 4: [makeSelection(tenders)] },
      byDate: {},
    });
    expect(screen.getByRole('button', { name: /Chicken Tenders \(2\) 1/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add to the bag · $4.90' }),
    ).not.toBeInTheDocument();

    const check = screen.getByRole('button', { name: 'Check every date' });
    expect(check).toBeEnabled();
    await user.click(check);
    expect(onContinue).toHaveBeenCalled();
  });

  it('searches the menu by item and by category', async () => {
    const user = userEvent.setup();
    renderStep();
    const search = await screen.findByLabelText('Search the menu');

    await user.type(search, 'sushi');
    expect(screen.getByRole('button', { name: /Sushi Roll/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chicken Tenders/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'hot food');
    expect(screen.getByRole('button', { name: /Chicken Tenders/ })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'pavlova');
    expect(screen.getByText('Nothing on the menu matches “pavlova”.')).toBeInTheDocument();
  });

  it('greys out an item the canteen has sold out of', async () => {
    menu.mockResolvedValue(
      makeMenu([
        makeCategory([
          makeItem({ inStock: false, unavailabilityMessage: ' Sold out for today ' }),
          sushi,
        ]),
      ]),
    );
    renderStep();

    expect(await screen.findByRole('button', { name: /Chicken Tenders/ })).toBeDisabled();
    expect(screen.getByText('Sold out for today')).toBeInTheDocument();
  });

  it('gives each weekday its own bag and can copy one across', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep({ dates: [THURSDAYS[0], FRIDAY] });

    const tabs = await screen.findByRole('group', { name: 'Each day can have its own lunch' });
    expect(within(tabs).getByRole('button', { name: /Thursdays/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: /Add to the bag/ }));
    expect(within(tabs).getByRole('button', { name: /Thursdays 1 item/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use Thursday’s lunch for every day' }));
    expect(onChange).toHaveBeenLastCalledWith({
      byDay: { 4: [makeSelection(tenders)], 5: [makeSelection(tenders)] },
      byDate: {},
    });

    await user.click(within(tabs).getByRole('button', { name: /Fridays/ }));
    expect(within(tabs).getByRole('button', { name: /Fridays/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets one date carry a different lunch, and hands it back again', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep({
      bags: { byDay: { 4: [makeSelection(tenders)] }, byDate: {} },
    });

    await screen.findByRole('heading', { name: 'Hot Food' });
    await user.click(screen.getByRole('button', { name: /15 Oct/ }));
    expect(
      await screen.findByText(/This date gets every Thursday’s lunch; change anything here/),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Sushi Roll/ }));
    await user.click(screen.getByRole('button', { name: /Add to the bag/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        byDate: { [THURSDAYS[1]]: [makeSelection(tenders), makeSelection(sushi)] },
      }),
    );
    expect(screen.getByRole('button', { name: /15 Oct 2 items/ })).toBeInTheDocument();
    expect(screen.getByText(/Thu 15 Oct has a lunch of its own/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Same as every Thursday' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ byDate: {}, byDay: { 4: [makeSelection(tenders)] } }),
    );
  });

  it('says why a single date cannot be ordered for and offers to skip it', async () => {
    const user = userEvent.setup();
    calendar = (date) =>
      date === THURSDAYS[1]
        ? makeFulfilment(date, { closureReason: 'Public holiday' })
        : makeFulfilment(date);
    const { onSkipDate } = renderStep();

    await screen.findByRole('heading', { name: 'Hot Food' });
    await user.click(screen.getByRole('button', { name: /15 Oct/ }));
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('The canteen is closed on this date: Public holiday.');

    await user.click(within(notice).getByRole('button', { name: 'Skip this date' }));
    expect(onSkipDate).toHaveBeenCalledWith(THURSDAYS[1]);
  });

  it('marks a date the canteen has closed, missed or never listed', async () => {
    const user = userEvent.setup();
    calendar = (date) => {
      if (date === THURSDAYS[0]) return null;
      if (date === THURSDAYS[1]) return makeFulfilment(date, { hasCutOffTimePassed: true });
      return makeFulfilment(date, { closureReason: 'Curriculum day' });
    };
    renderStep();

    expect(
      await screen.findByRole('button', { name: /8 Oct not on the calendar/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /15 Oct too late/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /22 Oct closed/ })).toBeInTheDocument();
    // Nothing is orderable, so the weekday itself has no menu to show.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'None of the chosen dates can be ordered for.',
    );

    await user.click(screen.getByRole('button', { name: /8 Oct not on the calendar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This date is not on the canteen calendar.',
    );

    await user.click(screen.getByRole('button', { name: /15 Oct too late/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The cut-off time for this date has passed.',
    );
  });

  it('reports a calendar it could not read', async () => {
    fulfilments.mockRejectedValue(new ApiError(500, '', '/api/v1.0/next-order-fulfillment-dates'));
    const { onError } = renderStep();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flexischools is having trouble right now.',
    );
    expect(onError).toHaveBeenCalled();
  });

  it('reports a menu it could not read', async () => {
    menu.mockRejectedValue(new TypeError('Failed to fetch'));
    const { onError } = renderStep();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach Flexischools.');
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.queryByText('Loading the menu…')).not.toBeInTheDocument();
  });

  it('warns that anything chosen goes on top of an order already placed', async () => {
    renderStep({
      existing: new Map([
        [THURSDAYS[0], [makeHistoryOrder(THURSDAYS[0])]],
        [THURSDAYS[2], [makeHistoryOrder(THURSDAYS[2])]],
      ]),
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sam already has an order for Thu 8 Oct (Chicken Tenders (2)) and Thu 22 Oct (Chicken Tenders (2)). Anything chosen here goes in as an extra order for those days.',
    );
    expect(screen.getByRole('button', { name: /8 Oct ordered/ })).toBeInTheDocument();
  });

  it('leaves the empty dates out rather than blocking the plan', async () => {
    const user = userEvent.setup();
    const { onBack } = renderStep({
      bags: { byDay: {}, byDate: { [THURSDAYS[0]]: [makeSelection(tenders)] } },
    });

    expect(
      await screen.findByText(
        'Nothing yet for Thu 15 Oct and Thu 22 Oct, so those dates are left out.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check every date' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('will not move on while an item still needs an option chosen', async () => {
    const needsBread = makeItem({
      itemKey: 'byo',
      name: 'Build-Your-Own',
      priceOption: 2,
      optionSets: [makeOptionSet()],
    });
    renderStep({ bags: { byDay: { 4: [makeSelection(needsBread)] }, byDate: {} } });

    expect(
      await screen.findByText('Finish choosing options for Build-Your-Own.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check every date' })).toBeDisabled();
  });

  it('skips a date from the menu hint, whether or not it has its own lunch', async () => {
    const user = userEvent.setup();
    const { onSkipDate } = renderStep({
      bags: {
        byDay: { 4: [makeSelection(tenders)] },
        byDate: { [THURSDAYS[1]]: [makeSelection(sushi)] },
      },
    });

    await screen.findByRole('heading', { name: 'Hot Food' });
    await user.click(screen.getByRole('button', { name: /22 Oct/ }));
    await user.click(await screen.findByRole('button', { name: 'Skip this date' }));
    expect(onSkipDate).toHaveBeenCalledWith(THURSDAYS[2]);

    await user.click(screen.getByRole('button', { name: /15 Oct/ }));
    expect(await screen.findByText(/Thu 15 Oct has a lunch of its own/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Skip this date' }));
    expect(onSkipDate).toHaveBeenLastCalledWith(THURSDAYS[1]);
  });

  it('names an item’s option sets on the menu and takes it back out of the bag', async () => {
    const user = userEvent.setup();
    const sandwich = makeItem({
      itemKey: 'byo',
      name: 'Build-Your-Own',
      priceOption: 2,
      optionSets: [makeOptionSet()],
    });
    menu.mockResolvedValue(makeMenu([makeCategory([sandwich])]));
    const { onChange } = renderStep({
      bags: {
        byDay: {
          4: [makeSelection(sandwich, { options: [{ optionKey: 'white', quantity: 1 }] })],
        },
        byDate: {},
      },
    });

    expect(await screen.findByText('Bread type')).toBeInTheDocument();
    const category = screen.getByRole('region', { name: 'Hot Food' });
    await user.click(within(category).getByRole('button', { name: /Build-Your-Own/ }));
    await user.click(screen.getByRole('button', { name: 'Take out of the bag' }));

    expect(onChange).toHaveBeenLastCalledWith({ byDay: { 4: [] }, byDate: {} });
  });
});
