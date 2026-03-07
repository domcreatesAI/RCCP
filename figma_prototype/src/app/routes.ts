import { createBrowserRouter, redirect } from 'react-router';
import { Layout } from './components/Layout';
import { PlanningData } from './components/planning-data/PlanningData';
import { RCCPDashboard } from './components/rccp-dashboard/RCCPDashboard';
import { Scenarios } from './components/scenarios/Scenarios';
import { ExecutiveSummary } from './components/executive-summary/ExecutiveSummary';
import { Configuration } from './components/configuration/Configuration';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, loader: () => redirect('/planning-data') },
      { path: 'planning-data', Component: PlanningData },
      { path: 'rccp-dashboard', Component: RCCPDashboard },
      { path: 'scenarios', Component: Scenarios },
      { path: 'executive-summary', Component: ExecutiveSummary },
      { path: 'configuration', Component: Configuration },
    ],
  },
]);
