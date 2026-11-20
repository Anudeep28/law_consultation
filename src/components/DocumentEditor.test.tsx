import { vi, type MockedFunction } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentEditor } from './DocumentEditor';
import { useDocumentStore } from '../stores/documentStore';

vi.mock('../stores/documentStore', () => ({
  useDocumentStore: Object.assign(vi.fn(), { getState: vi.fn() }),
}));

const mockedUseDocumentStore = useDocumentStore as unknown as MockedFunction<typeof useDocumentStore>;

describe('DocumentEditor language selector', () => {
  it('opens a requested template selector after the editor has loaded', async () => {
    const state = {
      currentDocument: { id: 'doc-1', title: 'Test', content: '', language: 'en', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1' },
      selectionStart: 0, selectionEnd: 0, setSelection: vi.fn(),
      updateDocument: vi.fn(), updateDocumentLanguage: vi.fn(), renameDocument: vi.fn(), createDocument: vi.fn(),
    };
    mockedUseDocumentStore.mockReturnValue(state as any);
    (useDocumentStore as any).getState = vi.fn().mockReturnValue(state);
    const onOpened = vi.fn();
    render(<DocumentEditor openTemplateSelector onTemplateSelectorOpened={onOpened} />);
    expect(await screen.findByRole('heading', { name: 'Choose Legal Template' })).toBeInTheDocument();
    expect(onOpened).toHaveBeenCalled();
  });

  it('opens the template selector from the empty state', async () => {
    const state = {
      currentDocument: null,
      selectionStart: 0, selectionEnd: 0, setSelection: vi.fn(),
      updateDocument: vi.fn(), updateDocumentLanguage: vi.fn(), renameDocument: vi.fn(), createDocument: vi.fn(),
    };
    mockedUseDocumentStore.mockReturnValue(state as any);
    (useDocumentStore as any).getState = vi.fn().mockReturnValue(state);
    render(<DocumentEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));
    expect(await screen.findByRole('heading', { name: 'Choose Legal Template' })).toBeInTheDocument();
  });

  it('displays the document language and calls updateDocumentLanguage on change', () => {
    const updateDocumentLanguage = vi.fn();
    const state = {
      currentDocument: {
        id: 'doc-1',
        title: 'Test',
        content: 'Hello',
        language: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
      },
      updateDocument: vi.fn(),
      updateDocumentLanguage,
      renameDocument: vi.fn(),
      createDocument: vi.fn(),
      selectionStart: 0,
      selectionEnd: 0,
      setSelection: vi.fn(),
    } as any;
    state.getState = () => state;
    mockedUseDocumentStore.mockReturnValue(state);
    (useDocumentStore as any).getState = vi.fn().mockReturnValue(state);

    render(<DocumentEditor />);

    const select = screen.getByLabelText('Document language') as HTMLSelectElement;
    expect(select.value).toBe('en');

    fireEvent.change(select, { target: { value: 'mr' } });
    expect(updateDocumentLanguage).toHaveBeenCalledWith('doc-1', 'mr');
  });
});
