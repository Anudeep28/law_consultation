import React, { createContext, useContext, useEffect, useState } from 'react';
import { LazyMotion, MotionConfig, type FeatureBundle } from 'motion/react';

const MotionReady = createContext(false);
export const useMotionReady = () => useContext(MotionReady);
const loadFeatures = () => import('./motionFeatures').then(module => module.default);

export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [features, setFeatures] = useState<FeatureBundle | null>(null);
  useEffect(() => {
    let mounted = true;
    void loadFeatures().then(bundle => { if (mounted) setFeatures(bundle); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return <MotionConfig reducedMotion="user">
    <LazyMotion features={features || loadFeatures} strict><MotionReady.Provider value={Boolean(features)}>{children}</MotionReady.Provider></LazyMotion>
  </MotionConfig>;
};
