import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentEditor } from './DocumentEditor';
import { useDocumentStore } from '../stores/documentStore';

jest.mock('../stores/documentStore', () => ({
  useDocumentStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

const mockedUseDocumentStore = useDocumentStore as unknown as jest.MockedFunction<typeof useDocumentStore>;

describe('DocumentEditor language selector', () => {
  it('displays the document language and calls updateDocumentLanguage on change', () => {
    const updateDocumentLanguage = jest.fn();
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
      updateDocument: jest.fn(),
      updateDocumentLanguage,
      renameDocument: jest.fn(),
      createDocument: jest.fn(),
      selectionStart: 0,
      selectionEnd: 0,
      setSelection: jest.fn(),
    } as any;
    state.getState = () => state;
    mockedUseDocumentStore.mockReturnValue(state);
    (useDocumentStore as any).getState = jest.fn().mockReturnValue(state);

    render(<DocumentEditor />);

    const select = screen.getByLabelText('Document language') as HTMLSelectElement;
    expect(select.value).toBe('en');

    fireEvent.change(select, { target: { value: 'mr' } });
    expect(updateDocumentLanguage).toHaveBeenCalledWith('doc-1', 'mr');
  });
});
