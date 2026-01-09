import { render, screen } from '@testing-library/react';

import App from '../App';

describe('App shell', () => {
  it('renders the main regions in the workspace', () => {
    render(<App />);

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar')).toBeInTheDocument();

        expect(screen.getByText(/ea modeller/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /model workspace/i })).toBeInTheDocument();
  });
});
