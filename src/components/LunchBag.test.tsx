import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Selection } from '../engine/pricing';
import type { Bags } from '../engine/selections';
import {
  FRIDAY,
  lunch,
  makeItem,
  makeOptionSet,
  makeSelection,
  student,
  tenders,
  THURSDAYS,
} from '../test/fixtures';
import LunchBag from './LunchBag';

const sandwich = makeItem({
  itemKey: 'byo',
  name: 'Build-Your-Own - Sandwich',
  itemPrice: 4.2,
  priceOption: 2,
  optionSets: [makeOptionSet()],
});

const twoTenders = makeSelection(tenders, { quantity: 2 });
const multigrain: Selection = makeSelection(sandwich, {
  options: [{ optionKey: 'multigrain', quantity: 1 }],
});

function renderBag(bags: Bags, overrides: Partial<Parameters<typeof LunchBag>[0]> = {}) {
  const onRemove = vi.fn();
  render(
    <LunchBag
      student={student}
      service={lunch}
      weekdays={[4]}
      dates={THURSDAYS}
      bags={bags}
      feePerOrder={0.33}
      onRemove={onRemove}
      {...overrides}
    />,
  );
  return onRemove;
}

describe('LunchBag', () => {
  it('names the empty bag before anything is chosen', () => {
    render(
      <LunchBag
        student={null}
        service={null}
        weekdays={[]}
        dates={[]}
        bags={{ byDay: {}, byDate: {} }}
        feePerOrder={null}
      />,
    );
    expect(screen.getByText('Whose lunch?')).toBeInTheDocument();
    expect(screen.getByText('no days yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing in the bag yet.')).toBeInTheDocument();
  });

  it('lists a weekday lunch line by line and costs the whole plan', () => {
    renderBag({ byDay: { 4: [twoTenders, multigrain] }, byDate: {} });

    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Lunch, 3 Thursdays')).toBeInTheDocument();
    expect(screen.getByText(/2 × Chicken Tenders/)).toBeInTheDocument();
    expect(screen.getByText('$9.80')).toBeInTheDocument();
    // The option is named, and the " - Sandwich" half of the item name is dropped.
    expect(screen.getByText('(Multigrain)')).toBeInTheDocument();
    expect(screen.getByText(/Build-Your-Own/)).not.toHaveTextContent('Sandwich');
    // One weekday and no date of its own, so there is no day heading to repeat.
    expect(screen.queryByText(/Thursdays/)).not.toHaveTextContent('× 3');
    expect(screen.getByText('Each lunch')).toBeInTheDocument();
    expect(screen.getByText('3 lunches + $0.33 fee each')).toBeInTheDocument();
    expect(screen.getByText('$42.99')).toBeInTheDocument();
  });

  it('gives a date with its own lunch a heading of its own', () => {
    renderBag({ byDay: { 4: [twoTenders] }, byDate: { [THURSDAYS[1]]: [multigrain] } });

    // The weekday count drops the date that now has its own lunch.
    expect(screen.getByText('Thursdays')).toHaveTextContent('× 2');
    expect(screen.getByText('Thu 15 Oct')).toBeInTheDocument();
    expect(screen.getByText('This lunch')).toBeInTheDocument();
    expect(screen.getByText('3 lunches + $0.33 fee each')).toBeInTheDocument();
    expect(screen.getByText('$24.79')).toBeInTheDocument();
  });

  it('says which weekdays are still empty and leaves weekdays with no dates out', () => {
    renderBag(
      { byDay: { 4: [twoTenders], 5: [] }, byDate: {} },
      { weekdays: [1, 4, 5], dates: [...THURSDAYS, FRIDAY] },
    );

    expect(screen.getByText('Nothing yet for Fridays.')).toBeInTheDocument();
    // Monday is picked but no planned date falls on one, so it is not drawn at all.
    expect(screen.queryByText(/Mondays/)).not.toBeInTheDocument();
  });

  it('removes a line from the bag it was clicked in', async () => {
    const user = userEvent.setup();
    const onRemove = renderBag({
      byDay: { 4: [twoTenders, multigrain] },
      byDate: { [THURSDAYS[1]]: [twoTenders] },
    });

    const lists = screen.getAllByRole('list');
    await user.click(within(lists[0]).getAllByRole('button', { name: 'remove' })[1]);
    expect(onRemove).toHaveBeenCalledWith({ day: 4 }, 1);

    await user.click(within(lists[1]).getByRole('button', { name: 'remove' }));
    expect(onRemove).toHaveBeenCalledWith({ date: THURSDAYS[1] }, 0);
  });

  it('leaves the remove buttons out when the bag is only being shown', () => {
    renderBag({ byDay: { 4: [twoTenders] }, byDate: {} }, { onRemove: undefined });
    expect(screen.queryByRole('button', { name: 'remove' })).not.toBeInTheDocument();
  });

  it('falls back to "option" for a choice the menu no longer lists', () => {
    renderBag({
      byDay: { 4: [makeSelection(sandwich, { options: [{ optionKey: 'rye', quantity: 1 }] })] },
      byDate: {},
    });
    expect(screen.getByText('(option)')).toBeInTheDocument();
  });
});
