import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ModelObject } from '../lib/api.ts';
import { buildTree } from '../lib/build-tree.ts';
import { __ToolbarForTests, __TreeRowViewForTests } from './ModelObjectsView.tsx';

function obj(
  id: string,
  name: string,
  type: ModelObject['type'],
  parentId: string | null,
): ModelObject {
  return {
    id,
    domainId: 'dom',
    parentId,
    type,
    name,
    internal: true,
    status: 'LIVE',
    displayDescription: null,
    detailedDescriptionMd: null,
    techChoiceId: null,
    techChoice: null,
    tagLinks: [],
    createdAt: '',
    updatedAt: '',
  };
}

const rowsFixture = buildTree(
  [obj('sys', 'Checkout', 'SYSTEM', null), obj('app', 'Web', 'APP', 'sys')],
  new Set(['sys']),
);

describe('TreeRowView', () => {
  it('renders the object name as a link to the dependencies view', () => {
    const first = rowsFixture[0]!;
    render(
      <MemoryRouter>
        <__TreeRowViewForTests row={first} onToggle={() => {}} domainId="dom-1" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Checkout' });
    expect(link).toHaveAttribute('href', '/domains/dom-1/dependencies/sys');
  });

  it('fires onToggle when the chevron is clicked on an expandable row', () => {
    const first = rowsFixture[0]!;
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <__TreeRowViewForTests row={first} onToggle={onToggle} domainId="dom-1" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Collapse|Expand/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('disables the chevron on a leaf row', () => {
    const leaf = rowsFixture.find((r) => r.id === 'app')!;
    render(
      <MemoryRouter>
        <__TreeRowViewForTests row={leaf} onToggle={() => {}} domainId="dom-1" />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /Collapse|Expand/ });
    expect(btn).toBeDisabled();
  });
});

describe('Toolbar', () => {
  function setup() {
    const handlers = {
      onSearch: vi.fn(),
      onTypeFilter: vi.fn(),
      onStatusFilter: vi.fn(),
      onHasDescription: vi.fn(),
      onExpandAll: vi.fn(),
      onCollapseAll: vi.fn(),
    };
    render(
      <__ToolbarForTests
        count={5}
        search=""
        typeFilter=""
        statusFilter=""
        hasDescription={undefined}
        {...handlers}
      />,
    );
    return handlers;
  }

  it('forwards search text to onSearch', () => {
    const h = setup();
    fireEvent.change(screen.getByLabelText('Search by name'), {
      target: { value: 'pay' },
    });
    expect(h.onSearch).toHaveBeenCalledWith('pay');
  });

  it('forwards type filter changes', () => {
    const h = setup();
    fireEvent.change(screen.getByLabelText('Filter by type'), {
      target: { value: 'APP' },
    });
    expect(h.onTypeFilter).toHaveBeenCalledWith('APP');
  });

  it('toggles hasDescription on and back off', () => {
    const h = setup();
    const checkbox = screen.getByLabelText('Has description') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(h.onHasDescription).toHaveBeenCalledWith(true);
  });

  it('renders the object count and expand/collapse buttons', () => {
    const h = setup();
    expect(screen.getByText('5 objects')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(h.onExpandAll).toHaveBeenCalledTimes(1);
    expect(h.onCollapseAll).toHaveBeenCalledTimes(1);
  });
});
