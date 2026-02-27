import { render, screen } from '@testing-library/react';

import App from '../App';

describe('App shell', () => {
  it('renders the main regions in the workspace', async () => {
    render(<App />);

    await screen.findByTestId('app-header');
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar')).toBeInTheDocument();

        expect(screen.getByText(/ea modeller/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /model workspace/i })).toBeInTheDocument();
  });
});
