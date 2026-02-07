import { renderHook } from '@testing-library/react';

import { useSandboxShortcuts } from '../useSandboxShortcuts';

function dispatchKey(key: string, target?: EventTarget) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true });
  if (target) {
    Object.defineProperty(ev, 'target', { value: target });
  }
  window.dispatchEvent(ev);
}

describe('useSandboxShortcuts', () => {
  test('Escape closes dialogs when any dialog/overlay is open', () => {
    const closeAllDialogs = jest.fn();
    const clearSelection = jest.fn();

    renderHook(() =>
      useSandboxShortcuts({
        enabled: true,
        isAnyDialogOpen: true,
        closeAllDialogs,
        clearSelection,
        canRemoveSelected: true,
        removeSelected: jest.fn(),
      })
    );

    dispatchKey('Escape');
    expect(closeAllDialogs).toHaveBeenCalledTimes(1);
    expect(clearSelection).not.toHaveBeenCalled();
  });

  test('Escape clears selection when no dialog is open', () => {
    const closeAllDialogs = jest.fn();
    const clearSelection = jest.fn();

    renderHook(() =>
      useSandboxShortcuts({
        enabled: true,
        isAnyDialogOpen: false,
        closeAllDialogs,
        clearSelection,
        canRemoveSelected: true,
        removeSelected: jest.fn(),
      })
    );

    dispatchKey('Escape');
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(closeAllDialogs).not.toHaveBeenCalled();
  });

  test('Delete removes selected when allowed and no dialog is open', () => {
    const removeSelected = jest.fn();

    renderHook(() =>
      useSandboxShortcuts({
        enabled: true,
        isAnyDialogOpen: false,
        closeAllDialogs: jest.fn(),
        clearSelection: jest.fn(),
        canRemoveSelected: true,
        removeSelected,
      })
    );

    dispatchKey('Delete');
    expect(removeSelected).toHaveBeenCalledTimes(1);
  });

  test('Delete does nothing when a dialog is open', () => {
    const removeSelected = jest.fn();

    renderHook(() =>
      useSandboxShortcuts({
        enabled: true,
        isAnyDialogOpen: true,
        closeAllDialogs: jest.fn(),
        clearSelection: jest.fn(),
        canRemoveSelected: true,
        removeSelected,
      })
    );

    dispatchKey('Delete');
    expect(removeSelected).not.toHaveBeenCalled();
  });

  test('ignores shortcuts when target is a text input', () => {
    const clearSelection = jest.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderHook(() =>
      useSandboxShortcuts({
        enabled: true,
        isAnyDialogOpen: false,
        closeAllDialogs: jest.fn(),
        clearSelection,
        canRemoveSelected: true,
        removeSelected: jest.fn(),
      })
    );

    dispatchKey('Escape', input);
    expect(clearSelection).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
