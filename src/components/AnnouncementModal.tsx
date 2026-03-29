import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info } from 'lucide-react';
import { ANNOUNCEMENT_CONTENT } from '../constants/announcement';
import { cn } from '../lib/utils';
import { CAMPUS_LABELS, CampusCode } from '../constants/campus';

interface AnnouncementModalProps {
  selectedCampus: CampusCode | null;
  onCampusChange: (campus: CampusCode) => void;
}

export default function AnnouncementModal({ selectedCampus, onCampusChange }: AnnouncementModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    const lastSeenDate = localStorage.getItem('lastSeenAnnouncementDate');
    const today = new Date().toISOString().split('T')[0];

    if (lastSeenDate !== today || !selectedCampus) {
      setIsOpen(true);
      setCountdown(3);
      setCanClose(false);
    }
  }, [selectedCampus, isOpen]);

  useEffect(() => {
    let timer: any;
    if (isOpen && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0 && selectedCampus) {
      setCanClose(true);
    } else {
      setCanClose(false);
    }
    return () => clearInterval(timer);
  }, [isOpen, countdown, selectedCampus]);

  const handleClose = () => {
    if (!canClose) return;
    setIsOpen(false);
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('lastSeenAnnouncementDate', today);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-gray-700/30 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-3 sm:p-6 border-b border-gray-100/50 dark:border-gray-700/50 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-xl text-white shadow-lg shadow-indigo-200 dark:shadow-none">
                  <Info size={18} className="sm:size-5" />
                </div>
                <h2 className="text-base sm:text-xl font-black text-gray-900 dark:text-white">
                  {ANNOUNCEMENT_CONTENT.title}
                </h2>
              </div>
              <button
                onClick={handleClose}
                disabled={!canClose}
                className={cn(
                  "p-2 rounded-xl transition-all text-gray-400 dark:text-gray-500",
                  canClose ? "hover:bg-gray-100 dark:hover:bg-gray-700" : "opacity-20 cursor-not-allowed"
                )}
              >
                {canClose ? <X size={24} /> : <span className="text-xs font-black">{countdown}s</span>}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4 scrollbar-hide">
              <div className="space-y-3 sm:space-y-4">
                {ANNOUNCEMENT_CONTENT.sections.map((section, idx) => (
                  <div key={idx} className="flex gap-2 sm:gap-3">
                    <div className="text-lg sm:text-xl shrink-0">{section.emoji}</div>
                    <div className="space-y-0.5">
                      <h3 className="font-bold text-gray-900 dark:text-white text-[13px] sm:text-sm flex items-center gap-2">
                        {section.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-[10px] sm:text-[11px] leading-relaxed">
                        {section.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 sm:p-4 bg-indigo-50/70 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 space-y-2">
                <p className="text-[10px] sm:text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  请选择校区 Select Campus
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['s', 'e'] as CampusCode[]).map((campusCode) => {
                    const isActive = selectedCampus === campusCode;
                    return (
                      <button
                        key={campusCode}
                        onClick={() => onCampusChange(campusCode)}
                        className={cn(
                          'px-3 py-2.5 rounded-xl text-xs sm:text-sm font-black border transition-all',
                          isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                        )}
                      >
                        {CAMPUS_LABELS[campusCode]}
                      </button>
                    );
                  })}
                </div>
                {!selectedCampus && (
                  <p className="text-[9px] sm:text-[10px] font-bold text-rose-500">
                    倒计时结束后也必须先选择校区，才可继续进入主页。
                  </p>
                )}
              </div>

              <div className="p-3 sm:p-4 bg-rose-50/50 dark:bg-rose-900/10 rounded-2xl border border-rose-100/50 dark:border-rose-900/20 space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-[10px] sm:text-xs">
                  <span>{ANNOUNCEMENT_CONTENT.warning.emoji}</span>
                  <span>{ANNOUNCEMENT_CONTENT.warning.title}</span>
                </div>
                <p className="text-rose-700/80 dark:text-rose-300/80 text-[9px] sm:text-[10px] leading-relaxed font-medium">
                  {ANNOUNCEMENT_CONTENT.warning.content}
                </p>
              </div>

              <div className="text-center space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs sm:text-sm">
                  {ANNOUNCEMENT_CONTENT.footer}
                </p>
                
                <div className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700/50 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wide text-gray-400 dark:text-gray-500">
                  {ANNOUNCEMENT_CONTENT.contact}
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 sm:p-8 border-t border-gray-100/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/30">
              <button
                onClick={handleClose}
                disabled={!canClose}
                className={cn(
                  "w-full font-black py-3 sm:py-4 rounded-2xl transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 text-sm sm:text-base",
                  canClose 
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none" 
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-none"
                )}
              >
                {canClose ? (
                  <>我知道了 Got it</>
                ) : (
                  <>{countdown > 0 ? `请阅读公告 (${countdown}s)` : '请选择校区后继续'}</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
