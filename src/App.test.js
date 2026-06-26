import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Kafka roadmap header', () => {
  render(<App />);
  expect(screen.getByText(/APACHE KAFKA/i)).toBeInTheDocument();
});
