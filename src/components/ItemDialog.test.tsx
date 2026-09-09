import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuItem, MenuOption, MenuOptionSet } from '../api/types';
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

function renderDialog(item: MenuItem) {
  const onSave = vi.fn();
  render(
    <ItemDialog
      item={item}
      existing={null}
      onSave={onSave}
      onRemove={() => {}}
      onClose={() => {}}
    />,
  );
  return onSave;
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
});
