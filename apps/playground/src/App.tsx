import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import PlaygroundPage from './components/playground/PlaygroundPage';

const isVercel =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('.vercel.app') || window.location.hostname === 'brepjs.dev');

export default function App() {
  return (
    <>
      <PlaygroundPage />
      {isVercel && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
    </>
  );
}
