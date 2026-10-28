import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('commits the selected choice naming mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModeToggle listName="drinks" mode={{ kind: 'snake' }} onChange={onChange} />);

    const trigger = screen.getByTestId('mode-select');
    expect(trigger).toHaveAttribute('role', 'combobox');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Numbers' }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'numeric' });
  });
});
