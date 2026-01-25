import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../App';

describe('Routing', () => {
  it('shows the About page when navigating to /about', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /about/i })).toBeInTheDocument();
  });

  it('shows the Analysis page when navigating to /analysis', () => {
    render(
      <MemoryRouter initialEntries={['/analysis']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /portfolio/i })).toBeInTheDocument();
  });

  it('redirects unknown routes to the workspace', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /model workspace/i })).toBeInTheDocument();
  });
});
