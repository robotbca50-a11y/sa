/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { motion } from 'framer-motion';

export default function Glitch({
  text,
  className = '',
  animate = true,
}: {
  text: string;
  className?: string;
  animate?: boolean;
}) {
  return (
    <span className={`relative inline-block ${className}`}>
      {animate && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 text-virus opacity-70 pointer-events-none"
            style={{ transform: 'translate(2px,-1px)', mixBlendMode: 'screen' }}
          >
            {text}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 text-neon opacity-70 pointer-events-none"
            style={{ transform: 'translate(-2px,1px)', mixBlendMode: 'screen' }}
          >
            {text}
          </span>
        </>
      )}
      <span className="relative animate-glitch-skip">{text}</span>
    </span>
  );
}

export function TypeWriter({ text, speed = 40, className = '' }: { text: string; speed?: number; className?: string }) {
  return (
    <span className={className}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * (speed / 1000), duration: 0.01 }}
        >
          {ch}
        </motion.span>
      ))}
      <span className="caret">_</span>
    </span>
  );
}
