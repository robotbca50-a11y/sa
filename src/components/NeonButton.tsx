/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export default function NeonButton({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'lime';
  className?: string;
  disabled?: boolean;
  small?: boolean;
}) {
  const base =
    'relative inline-flex items-center justify-center gap-2 font-mono uppercase tracking-widest rounded-lg transition-all cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed';
  const size = small ? 'px-3 py-1.5 text-[11px]' : 'px-6 py-3 text-sm';
  const styles: Record<string, string> = {
    primary:
      'bg-neon/10 text-neon border border-neon/40 hover:bg-neon/20 hover:shadow-[0_0_24px_rgba(0,240,255,0.45)]',
    ghost:
      'bg-transparent text-slate-300 border border-white/15 hover:border-neon/60 hover:text-neon',
    danger:
      'bg-virus/10 text-virus border border-virus/40 hover:bg-virus/20 hover:shadow-[0_0_24px_rgba(255,46,166,0.4)]',
    lime:
      'bg-lime/10 text-lime border border-lime/40 hover:bg-lime/20 hover:shadow-[0_0_24px_rgba(182,255,46,0.4)]',
  };
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${size} ${styles[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}
