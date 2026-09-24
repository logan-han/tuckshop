import { makeSelection, sushi, tenders } from '../test/fixtures';
import { clearDraft, holdsFood, loadDraft, saveDraft, type Draft } from './draft';

const now = Date.parse('2026-10-06T02:00:00Z');

const draft: Draft = {
  owner: 'student-1|lunch',
  bags: {
    byDay: { 4: [makeSelection(tenders)] },
    byDate: { '2026-10-15': [makeSelection(sushi)] },
  },
  step: 'what',
  savedAt: now - 60_000,
};

beforeEach(() => window.sessionStorage.clear());

describe('the draft bag', () => {
  it('comes back as it was saved', () => {
    saveDraft(draft);
    expect(loadDraft(now)).toEqual(draft);
    clearDraft();
    expect(loadDraft(now)).toBeNull();
  });

  it('is dropped once it is a day old', () => {
    saveDraft({ ...draft, savedAt: now - 25 * 60 * 60 * 1000 });
    expect(loadDraft(now)).toBeNull();
  });

  it('ignores anything it does not recognise', () => {
    const saved = (value: unknown) => {
      window.sessionStorage.setItem('tuckshop.draft', JSON.stringify(value));
      return loadDraft(now);
    };
    expect(saved(null)).toBeNull();
    expect(saved({ ...draft, step: 'done' })).toBeNull();
    expect(saved({ ...draft, owner: 7 })).toBeNull();
    expect(saved({ ...draft, bags: { byDay: { 4: [{ item: {} }] }, byDate: {} } })).toBeNull();
    expect(saved({ ...draft, bags: undefined })).toBeNull();
    window.sessionStorage.setItem('tuckshop.draft', '{not json');
    expect(loadDraft(now)).toBeNull();
  });

  it('gets by when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveDraft(draft)).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('knows an empty bag from one with food in it', () => {
    expect(holdsFood(draft.bags)).toBe(true);
    expect(holdsFood({ byDay: { 4: [] }, byDate: {} })).toBe(false);
  });
});
