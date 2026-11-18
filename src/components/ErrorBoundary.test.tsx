import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { reportBoundaryError } from '../services/monitoring';

jest.mock('../services/monitoring', () => ({ reportBoundaryError: jest.fn() }));

afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

test('renders healthy children without a fallback', () => {
  render(<ErrorBoundary><p>Healthy application</p></ErrorBoundary>);
  expect(screen.getByText('Healthy application')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(reportBoundaryError).not.toHaveBeenCalled();
});

test('shows an accessible friendly fallback, reports errors and provides reload', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('Private technical detail');
  const Broken = (): never => { throw error; };
  const reload = jest.fn();
  render(<ErrorBoundary onReload={reload}><Broken /></ErrorBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  expect(screen.queryByText('Private technical detail')).not.toBeInTheDocument();
  expect(reportBoundaryError).toHaveBeenCalledWith(error, expect.objectContaining({ componentStack: expect.any(String) }));
  fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
  expect(reload).toHaveBeenCalledTimes(1);
});
