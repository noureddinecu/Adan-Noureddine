import { BottomNav } from './components/BottomNav';
import { useLayoutEffect } from 'react';
import { savedScroll, useRoute } from './lib/router';
import { useTheme } from './lib/theme';
import { About } from './pages/About';
import { Detail } from './pages/Detail';
import { Favorites } from './pages/Favorites';
import { HistoryPage } from './pages/HistoryPage';
import { Home } from './pages/Home';
import { SectionPage } from './pages/Section';

export function App({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const route = useRoute();
  const [head, arg] = route.parts;
  let page;
  switch (head) {
    case 'v': page = <Detail key={arg} id={arg} q={route.query.get('q') ?? ''} />; break;
    case 'section': page = <SectionPage key={arg} sectionKey={arg} />; break;
    case 'favorites': page = <Favorites />; break;
    case 'history': page = <HistoryPage />; break;
    case 'about': page = <About theme={theme} />; break;
    default: page = <Home route={route} theme={theme} />;
  }
  // scroll: restore the list position when coming back, top of page otherwise
  useLayoutEffect(() => {
    if (route.dir === 'none') return;
    const y = route.dir === 'back' ? savedScroll() : undefined;
    window.scrollTo(0, y ?? 0);
  }, [route.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = route.dir === 'back' ? 'page-back' : route.dir === 'forward' ? 'page-forward' : route.dir === 'tab' ? 'page-fade' : '';
  return (
    <>
      <div key={route.path} className={anim}>{page}</div>
      <BottomNav path={route.path} />
    </>
  );
}
