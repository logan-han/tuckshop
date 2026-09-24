import { useEffect, useRef, useState } from 'react';
import type { MenuItem } from '../api/types';
import {
  describePrice,
  formatMoney,
  fromPrice,
  lineTotal,
  missingChoices,
  splitName,
  type OptionChoice,
  type Selection,
} from '../engine/pricing';

interface Props {
  item: MenuItem;
  existing: Selection | null;
  onSave: (selection: Selection) => void;
  onRemove: () => void;
  onClose: () => void;
}

function defaultChoices(item: MenuItem): OptionChoice[] {
  return item.optionSets.flatMap((set) =>
    set.options
      .filter((o) => o.isDefault && o.isActive && o.inStock)
      .map((o) => ({ optionKey: o.optionKey, quantity: 1 })),
  );
}

/** The description without its HTML, or null when the canteen left only a stray full stop. */
function plainDescription(description: string | null): string | null {
  const text = (description ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : null;
}

export default function ItemDialog({ item, existing, onSave, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const [options, setOptions] = useState<OptionChoice[]>(existing?.options ?? defaultChoices(item));
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries((existing?.questions ?? []).map((q) => [q.questionKey, q.answer])),
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const selection: Selection = {
    item,
    quantity,
    options,
    questions: item.questionSets
      .flatMap((set) => set.questions)
      .map((q) => ({ questionKey: q.questionKey, answer: answers[q.questionKey] ?? '' })),
  };
  const missing = missingChoices(selection);
  const [title, detail] = splitName(item.name);
  const description = plainDescription(item.description);
  // A $0 cup whose flavours carry the price has no price worth heading it; the button has the total.
  const priced = fromPrice(item) > 0;
  const maxQuantity =
    item.hasQuantitySellLimit && item.quantityLeft !== null ? Math.max(1, item.quantityLeft) : 20;

  function chooseOne(setKeys: string[], optionKey: string) {
    setOptions((current) => [
      ...current.filter((c) => !setKeys.includes(c.optionKey)),
      { optionKey, quantity: 1 },
    ]);
  }

  function toggleMany(optionKey: string, allowed: number | null, setKeys: string[]) {
    setOptions((current) => {
      if (current.some((c) => c.optionKey === optionKey)) {
        return current.filter((c) => c.optionKey !== optionKey);
      }
      const chosenInSet = current.filter((c) => setKeys.includes(c.optionKey)).length;
      if (allowed !== null && chosenInSet >= allowed) return current;
      return [...current, { optionKey, quantity: 1 }];
    });
  }

  return (
    <dialog className="dialog" ref={ref} aria-labelledby="item-title">
      <div className="dialog__body">
        <h2 id="item-title" className="dialog__title">
          {title}
        </h2>
        {detail && <p className="dialog__detail">{detail}</p>}
        {(priced || description) && (
          <p className="dialog__price">
            {priced && describePrice(item)}
            {description && (
              <span className="hint">
                {priced && ' · '}
                {description}
              </span>
            )}
          </p>
        )}

        {item.optionSets.map((set) => {
          const setKeys = set.options.map((o) => o.optionKey);
          const single = set.optionSetRenderType === 1 || set.maxQuantity === 1;
          // The portal reads a maxQuantity of 0 the same as null: no limit.
          const limit = set.maxQuantity || null;
          const chosenInSet = options.filter((c) => setKeys.includes(c.optionKey)).length;
          const full = !single && limit !== null && chosenInSet >= limit;
          return (
            <fieldset className="option-set" key={set.optionSetKey}>
              <legend className="option-set__legend">
                {set.name}
                <span className="hint">
                  {' '}
                  {single
                    ? set.minQuantity
                      ? 'choose one'
                      : 'optional'
                    : limit
                      ? `choose up to ${limit}`
                      : 'choose any'}
                </span>
              </legend>
              {set.options
                .filter((option) => option.isActive)
                .map((option) => {
                  const checked = options.some((c) => c.optionKey === option.optionKey);
                  return (
                    <label className="option" key={option.optionKey} data-soldout={!option.inStock}>
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={set.optionSetKey}
                        checked={checked}
                        disabled={!option.inStock || (full && !checked)}
                        onChange={() =>
                          single
                            ? chooseOne(setKeys, option.optionKey)
                            : toggleMany(option.optionKey, limit, setKeys)
                        }
                      />
                      <span>
                        {option.name}
                        {!option.inStock && <span className="hint"> sold out</span>}
                      </span>
                      {option.optionPrice > 0 && (
                        <span className="option__price">+{formatMoney(option.optionPrice)}</span>
                      )}
                    </label>
                  );
                })}
            </fieldset>
          );
        })}

        {item.questionSets
          .flatMap((set) => set.questions)
          .map((question) => (
            <div className="field" key={question.questionKey}>
              <label className="field__label" htmlFor={`q-${question.questionKey}`}>
                {question.name}
              </label>
              <input
                id={`q-${question.questionKey}`}
                className="input"
                value={answers[question.questionKey] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [question.questionKey]: e.target.value })}
              />
            </div>
          ))}

        <div className="field">
          <span className="field__label" id="qty-label">
            How many per lunch
          </span>
          <div className="stepper" role="group" aria-labelledby="qty-label">
            <button
              type="button"
              aria-label="One fewer"
              disabled={quantity <= 1}
              onClick={() => setQuantity(quantity - 1)}
            >
              −
            </button>
            <output aria-live="polite">{quantity}</output>
            <button
              type="button"
              aria-label="One more"
              disabled={quantity >= maxQuantity}
              onClick={() => setQuantity(quantity + 1)}
            >
              +
            </button>
          </div>
          {item.hasQuantitySellLimit && item.quantityLeft !== null && (
            <span className="hint">{item.quantityLeft} left for the first date</span>
          )}
        </div>

        {existing && (
          <p>
            <button type="button" className="link-button link-button--danger" onClick={onRemove}>
              Take out of the bag
            </button>
          </p>
        )}

        {missing.length > 0 && <p className="hint">Still to choose: {missing.join(', ')}.</p>}

        <div className="actions">
          <button
            type="button"
            className="button button--go"
            disabled={missing.length > 0}
            onClick={() => onSave(selection)}
          >
            {existing ? 'Update' : 'Add to the bag'} · {formatMoney(lineTotal(selection))}
          </button>
          <button type="button" className="button button--quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
