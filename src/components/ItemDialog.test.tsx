import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuItem, MenuOption, MenuOptionSet } from '../api/types';
import type { Selection } from '../engine/pricing';
import { makeItem } from '../engine/pricing.test';
import ItemDialog from './ItemDialog';

function option(
  optionKey: string,
  name: string,
  optionPrice = 0,
  extra: Partial<MenuOption> = {},
): MenuOption {
  return {
    optionKey,
    name,
    isActive: true,
    inStock: true,
    isDefault: false,
    optionSequence: 0,
    optionTax: 0,
    optionPrice,
    hasQuantitySellLimit: false,
    quantityLeft: 0,
    ...extra,
  };
}

function flavourSet(overrides: Partial<MenuOptionSet> = {}): MenuOptionSet {
  return {
    optionSetKey: 'flavour',
    name: 'Flavour',
    minQuantity: 0,
    maxQuantity: 0,
    sequence: 0,
    optionSetRenderType: 2,
    options: [
      option('straw', 'Strawberry', 1.5),
      option('mango', 'Mango', 1.5),
      option('vanilla', 'Vanilla', 1.5),
    ],
    ...overrides,
  };
}

// As the canteen publishes it: $0 cup, priced flavours, a maxQuantity of 0 and a "." description.
const yoghurt: MenuItem = makeItem({
  itemKey: 'yoghurt',
  name: 'Frozen Yoghurt Cup',
  itemPrice: 0,
  priceOption: 2,
  hasQuantitySellLimit: false,
  quantityLeft: null,
  description: '<p>.</p>',
  optionSets: [flavourSet()],
});

function renderDialog(item: MenuItem, existing: Selection | null = null) {
  const onSave = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  render(
    <ItemDialog
      item={item}
      existing={existing}
      onSave={onSave}
      onRemove={onRemove}
      onClose={onClose}
    />,
  );
  return Object.assign(onSave, { onSave, onRemove, onClose });
}

describe('ItemDialog', () => {
  it('lets any number of priced flavours be ticked when the set has no limit', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog(yoghurt);
    const add = screen.getByRole('button', { name: /Add to the bag/ });
    expect(add).toHaveTextContent('$0.00');
    expect(screen.getByText('choose any')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Strawberry/ }));
    expect(screen.getByRole('checkbox', { name: /Strawberry/ })).toBeChecked();
    expect(add).toHaveTextContent('$1.50');
    await user.click(screen.getByRole('checkbox', { name: /Mango/ }));
    expect(add).toHaveTextContent('$3.00');

    await user.click(add);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          { optionKey: 'straw', quantity: 1 },
          { optionKey: 'mango', quantity: 1 },
        ],
      }),
    );
  });

  it('greys out the rest of the set once it is full', async () => {
    const user = userEvent.setup();
    renderDialog(makeItem({ ...yoghurt, optionSets: [flavourSet({ maxQuantity: 2 })] }));
    expect(screen.getByText('choose up to 2')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Strawberry/ }));
    await user.click(screen.getByRole('checkbox', { name: /Mango/ }));
    expect(screen.getByRole('checkbox', { name: /Vanilla/ })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Mango/ }));
    expect(screen.getByRole('checkbox', { name: /Vanilla/ })).toBeEnabled();
  });

  it('keeps single-choice sets as radios that must be answered', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog(
      makeItem({
        ...yoghurt,
        optionSets: [flavourSet({ minQuantity: 1, maxQuantity: 1, optionSetRenderType: 1 })],
      }),
    );
    const add = screen.getByRole('button', { name: /Add to the bag/ });
    expect(add).toBeDisabled();
    expect(screen.getByText(/Still to choose: Flavour/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Mango/ }));
    expect(add).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: /Vanilla/ }));
    await user.click(add);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ options: [{ optionKey: 'vanilla', quantity: 1 }] }),
    );
  });

  it('hides inactive options and a description that is only punctuation', () => {
    renderDialog(
      makeItem({
        ...yoghurt,
        optionSets: [
          flavourSet({
            options: [
              option('straw', 'Strawberry', 1.5),
              option('old', 'Old flavour', 1.5, { isActive: false }),
            ],
          }),
        ],
      }),
    );
    expect(screen.getByText('Strawberry')).toBeInTheDocument();
    expect(screen.queryByText('Old flavour')).not.toBeInTheDocument();
    expect(document.querySelector('.dialog__price')).toHaveTextContent(/^\$0\.00$/);
  });

  it('carries the answers to the canteen’s questions', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog(
      makeItem({
        ...yoghurt,
        optionSets: [],
        questionSets: [
          {
            questionSetKey: 'notes',
            questions: [{ questionKey: 'name', name: 'Name on the bag' }],
          },
        ],
      }),
    );

    await user.type(screen.getByLabelText('Name on the bag'), 'Sam');
    await user.click(screen.getByRole('button', { name: /Add to the bag/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ questions: [{ questionKey: 'name', answer: 'Sam' }] }),
    );
  });

  it('counts serves up and down, stopping at one and at what is left', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog(
      makeItem({ itemPrice: 4.9, priceOption: 1, hasQuantitySellLimit: true, quantityLeft: 2 }),
    );

    expect(screen.getByText('2 left for the first date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByRole('button', { name: /Add to the bag/ })).toHaveTextContent('$9.80');
    // Only two left, so the stepper will not go past it.
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'One fewer' }));
    await user.click(screen.getByRole('button', { name: /Add to the bag/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1 }));
  });

  it('opens on what is already in the bag, and can take it back out', async () => {
    const user = userEvent.setup();
    const item = makeItem({ ...yoghurt, optionSets: [flavourSet()] });
    const dialog = renderDialog(item, {
      item,
      quantity: 2,
      options: [{ optionKey: 'mango', quantity: 1 }],
      questions: [],
    });

    expect(screen.getByRole('checkbox', { name: /Mango/ })).toBeChecked();
    expect(screen.getByRole('button', { name: /Update/ })).toHaveTextContent('$3.00');

    await user.click(screen.getByRole('button', { name: 'Take out of the bag' }));
    expect(dialog.onRemove).toHaveBeenCalled();
  });

  it('ticks the canteen’s own default options to start with', () => {
    renderDialog(
      makeItem({
        ...yoghurt,
        optionSets: [
          flavourSet({
            options: [
              option('straw', 'Strawberry', 1.5, { isDefault: true }),
              option('mango', 'Mango', 1.5),
              option('gone', 'Sold-out flavour', 1.5, { inStock: false }),
            ],
          }),
        ],
      }),
    );
    expect(screen.getByRole('checkbox', { name: /Strawberry/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Sold-out flavour/ })).toBeDisabled();
    expect(screen.getByText('sold out')).toBeInTheDocument();
  });

  it('shows a real description and closes when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const dialog = renderDialog(
      makeItem({ ...yoghurt, optionSets: [], description: '<p>Two tenders  with sauce</p>' }),
    );
    expect(screen.getByText('· Two tenders with sauce')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog.onClose).toHaveBeenCalled();
  });
});
