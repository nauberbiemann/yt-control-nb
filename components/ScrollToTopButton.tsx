'use client';

import { useEffect, useState, type RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

type ScrollToTopButtonProps = {
  containerRef?: RefObject<HTMLElement | null>;
};

export default function ScrollToTopButton({ containerRef }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef?.current ?? null;

    const getWindowScrollTop = () => {
      if (typeof window === 'undefined') return 0;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const getContainerScrollTop = () => (container ? container.scrollTop : 0);

    const handleScroll = () => {
      setVisible(Math.max(getWindowScrollTop(), getContainerScrollTop()) > 220);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    container?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef]);

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    containerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500 text-white px-4 py-3 shadow-2xl shadow-blue-500/30 backdrop-blur-xl transition-all hover:bg-blue-400 hover:scale-105 active:scale-95"
    >
      <ArrowUp size={16} />
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Topo</span>
    </button>
  );
}
