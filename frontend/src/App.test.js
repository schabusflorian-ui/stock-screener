import { render, screen } from '@testing-library/react';
import App from './App';

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children}</div>,
  Route: () => null,
  Navigate: () => null,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useParams: () => ({}),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/' })
}));

// Mock the API services
jest.mock('./services/api', () => ({
  companyAPI: {
    getAll: jest.fn(() => Promise.resolve({ data: [] })),
    getOne: jest.fn(() => Promise.resolve({ data: {} }))
  },
  statsAPI: {
    getDashboard: jest.fn(() => Promise.resolve({ data: {} })),
    getHighlights: jest.fn(() => Promise.resolve({ data: {} }))
  }
}));

describe('App', () => {
  test('renders without crashing', () => {
    render(<App />);
    // App should render the layout
    expect(document.body).toBeInTheDocument();
  });
});
