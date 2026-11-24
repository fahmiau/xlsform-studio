import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AddRowBar } from './AddRowBar';
import { FreezeColumnHandle } from './FreezeColumnHandle';

describe('FreezeColumnHandle', () => {
  const widths = [88, 130, 150, 240, 200];
  const hostRect = new DOMRect(100, 50, 900, 400);

  it('drags left to unfreeze all data columns', () => {
    const onCommit = vi.fn();
    render(
      <FreezeColumnHandle
        columnWidths={widths}
        frozenCount={4}
        maxDataColumns={4}
        viewportWidth={900}
        bodyHeight={366}
        dataBottomInBody={200}
        getHostRect={() => hostRect}
        getScrollLeft={() => 0}
        onCommit={onCommit}
      />,
    );

    const handle = screen.getByTestId('freeze-column-handle');
    expect(handle).toHaveAttribute('aria-valuenow', '3');

    // Edge sits at 88 + 130 + 150 + 240 = 608; drag to gutter edge (x = 88 -> clientX = 188).
    fireEvent.pointerDown(handle, { button: 0, clientX: 708 });
    expect(screen.getByTestId('freeze-drag-guide')).toBeInTheDocument();
    fireEvent.pointerMove(window, { clientX: 190 });
    fireEvent.pointerUp(window, { clientX: 190 });

    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it('cancels drag on Escape without committing', () => {
    const onCommit = vi.fn();
    render(
      <FreezeColumnHandle
        columnWidths={widths}
        frozenCount={1}
        maxDataColumns={4}
        viewportWidth={900}
        bodyHeight={366}
        dataBottomInBody={200}
        getHostRect={() => hostRect}
        getScrollLeft={() => 0}
        onCommit={onCommit}
      />,
    );

    const handle = screen.getByTestId('freeze-column-handle');
    fireEvent.pointerDown(handle, { button: 0, clientX: 188 });
    fireEvent.pointerMove(window, { clientX: 468 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { clientX: 468 });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('supports keyboard adjustment via ArrowLeft, ArrowRight, Home, and End', () => {
    const onCommit = vi.fn();
    render(
      <FreezeColumnHandle
        columnWidths={widths}
        frozenCount={3}
        maxDataColumns={4}
        viewportWidth={900}
        bodyHeight={366}
        dataBottomInBody={200}
        getHostRect={() => hostRect}
        getScrollLeft={() => 0}
        onCommit={onCommit}
      />,
    );

    const handle = screen.getByTestId('freeze-column-handle');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onCommit).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(onCommit).toHaveBeenLastCalledWith(4);
  });
});

describe('AddRowBar', () => {
  it('renders one full-width clickable button and invokes onAddRow', () => {
    const onAddRow = vi.fn();
    const onWheel = vi.fn();
    render(
      <AddRowBar
        topInBody={102}
        viewportWidth={800}
        bodyHeight={400}
        label="Add row"
        onAddRow={onAddRow}
        onWheel={onWheel}
      />,
    );

    const button = screen.getByTestId('add-row-button');
    expect(button).toHaveTextContent('Add row');
    fireEvent.click(button);
    expect(onAddRow).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when scrolled out of view', () => {
    const { container } = render(
      <AddRowBar
        topInBody={null}
        viewportWidth={800}
        bodyHeight={400}
        label="Add row"
        onAddRow={() => undefined}
        onWheel={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
