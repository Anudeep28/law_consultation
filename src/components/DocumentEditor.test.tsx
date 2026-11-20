import { vi, type MockedFunction } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentEditor } from './DocumentEditor';
import { useDocumentStore } from '../stores/documentStore';

vi.mock('../stores/documentStore', () => ({
  useDocumentStore: Object.assign(vi.fn(), { getState: vi.fn() }),
}));

const mockedUseDocumentStore = useDocumentStore as unknown as MockedFunction<typeof useDocumentStore>;

describe('DocumentEditor language selector', () => {
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
