"use client";

import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUp,
  Paperclip,
  Square,
  X,
  StopCircle,
  Mic,
  Globe,
  BrainCog,
  FolderCode,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Textarea ──
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] resize-none",
      className
    )}
    ref={ref}
    rows={1}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ── Tooltip ──
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";

// ── Dialog ──
const Dialog = DialogPrimitive.Root;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[90vw] md:max-w-[800px] -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-card p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-secondary/80 p-2 hover:bg-secondary transition-all">
        <X className="h-5 w-5 text-foreground" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

// ── Voice Recorder ──
const VoiceRecorder: React.FC<{
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: (duration: number) => void;
  visualizerBars?: number;
}> = ({ isRecording, onStartRecording, onStopRecording, visualizerBars = 32 }) => {
  const [time, setTime] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (isRecording) {
      onStartRecording();
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onStopRecording(time);
      setTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center w-full transition-all duration-300 py-3",
        isRecording ? "opacity-100" : "opacity-0 h-0"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="font-mono text-sm text-foreground/80">{formatTime(time)}</span>
      </div>
      <div className="w-full h-10 flex items-center justify-center gap-0.5 px-4">
        {[...Array(visualizerBars)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full bg-foreground/40 animate-pulse"
            style={{
              height: `${Math.max(15, Math.random() * 100)}%`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ── Image Preview Dialog ──
const ImageViewDialog: React.FC<{
  imageUrl: string | null;
  onClose: () => void;
}> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[90vw] md:max-w-[800px]">
        <DialogPrimitive.Title className="sr-only">Aperçu</DialogPrimitive.Title>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" as const }}
          className="relative bg-card rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Aperçu"
            className="w-full max-h-[80vh] object-contain rounded-2xl"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// ── PromptInput Context ──
interface PromptInputContextType {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
}

const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
});

function usePromptInput() {
  return React.useContext(PromptInputContext);
}

// ── PromptInput Wrapper ──
interface PromptInputProps {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || "");
    const handleChange = (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              "rounded-3xl border border-border bg-card p-2 shadow-lg transition-all duration-300",
              "focus-within:border-ring/40 focus-within:shadow-[0_0_0_1px_hsl(var(--ring)/0.2),0_0_12px_-4px_hsl(var(--ring)/0.1)]",
              isLoading && "border-red-500/70",
              className
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    );
  }
);
PromptInput.displayName = "PromptInput";

// ── PromptInput Textarea ──
const PromptInputTextarea: React.FC<
  { disableAutosize?: boolean; placeholder?: string } & React.ComponentProps<typeof Textarea>
> = ({ className, onKeyDown, disableAutosize = false, placeholder, ...props }) => {
  const { value, setValue, maxHeight, onSubmit, disabled, isLoading } = usePromptInput();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height =
      typeof maxHeight === "number"
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
  }, [value, maxHeight, disableAutosize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  };

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn("text-base", className)}
      disabled={disabled || isLoading}
      placeholder={placeholder}
      {...props}
    />
  );
};

// ── PromptInput Actions ──
const PromptInputActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

const PromptInputAction: React.FC<
  React.ComponentProps<typeof Tooltip> & {
    tooltip: React.ReactNode;
    children: React.ReactNode;
    side?: "top" | "bottom" | "left" | "right";
    className?: string;
  }
> = ({ tooltip, children, className, side = "top", ...props }) => {
  const { disabled } = usePromptInput();
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

// ── Divider ──
const CustomDivider: React.FC = () => (
  <div className="relative h-6 w-[1.5px] mx-1">
    <div
      className="absolute inset-0 bg-gradient-to-t from-transparent via-primary/50 to-transparent rounded-full"
      style={{
        clipPath:
          "polygon(0% 0%, 100% 0%, 100% 40%, 140% 50%, 100% 60%, 100% 100%, 0% 100%, 0% 60%, -40% 50%, 0% 40%)",
      }}
    />
  </div>
);

// ── Main Prompt Box ──
export interface ActiveModes {
  search: boolean;
  think: boolean;
  canvas: boolean;
}

// Keep for backwards compat
export type ChatMode = "default" | "search" | "think" | "canvas";

interface ChatInputProps {
  onSend?: (message: string, files?: File[], modes?: ActiveModes) => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  onSend = () => {},
  onStop,
  isLoading = false,
  placeholder = "Posez votre question...",
  className,
}: ChatInputProps) {
  type OnSendFn = (message: string, files?: File[], modes?: ActiveModes) => void;
  const typedOnSend = onSend as OnSendFn;
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [filePreviews, setFilePreviews] = React.useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(false);
  const [showThink, setShowThink] = React.useState(false);
  const [showCanvas, setShowCanvas] = React.useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const promptBoxRef = React.useRef<HTMLDivElement>(null);

  const handleToggleChange = (value: string) => {
    if (value === "search") setShowSearch((p) => !p);
    else if (value === "think") setShowThink((p) => !p);
  };

  const handleCanvasToggle = () => setShowCanvas((p) => !p);

  const processFile = React.useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    setFiles([file]);
    const reader = new FileReader();
    reader.onload = (e) => setFilePreviews({ [file.name]: e.target?.result as string });
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFiles = Array.from(e.dataTransfer.files);
      const img = droppedFiles.find((f) => f.type.startsWith("image/"));
      if (img) processFile(img);
    },
    [processFile]
  );

  const handleRemoveFile = (index: number) => {
    const f = files[index];
    if (f && filePreviews[f.name]) setFilePreviews({});
    setFiles([]);
  };

  const handlePaste = React.useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    },
    [processFile]
  );

  React.useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleSubmit = () => {
    if (input.trim() || files.length > 0) {
      const modes: ActiveModes = { search: showSearch, think: showThink, canvas: showCanvas };
      typedOnSend(input, files, modes);
      setInput("");
      setFiles([]);
      setFilePreviews({});
      setShowSearch(false);
      setShowThink(false);
      setShowCanvas(false);
    }
  };

  const handleStartRecording = () => {};
  const handleStopRecording = (duration: number) => {
    setIsRecording(false);
    onSend(`[Message vocal - ${duration}s]`, []);
  };

  const hasContent = input.trim() !== "" || files.length > 0;

  return (
    <>
      <div className="px-6 py-4 pb-6">
        <div className="max-w-3xl mx-auto">
          <PromptInput
            value={input}
            onValueChange={setInput}
            isLoading={isLoading}
            onSubmit={handleSubmit}
            className={cn(
              "w-full transition-all duration-300 ease-in-out",
              isRecording && "border-red-500/70",
              className
            )}
            disabled={isRecording}
            ref={promptBoxRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* File previews */}
            {files.length > 0 && !isRecording && (
              <div className="flex flex-wrap gap-2 p-0 pb-1">
                {files.map((file, index) =>
                  file.type.startsWith("image/") && filePreviews[file.name] ? (
                    <div key={index} className="relative group">
                      <div
                        className="w-16 h-16 rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
                        onClick={() => setSelectedImage(filePreviews[file.name])}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={filePreviews[file.name]}
                          alt={file.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                          className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Textarea */}
            <div
              className={cn(
                "transition-all duration-300",
                isRecording ? "h-0 overflow-hidden opacity-0" : "opacity-100"
              )}
            >
              <PromptInputTextarea
                placeholder={
                  showSearch && showThink && showCanvas
                    ? "Recherche web + réflexion approfondie → présentation..."
                    : showSearch && showThink
                    ? "Recherche web + réflexion approfondie..."
                    : showSearch && showCanvas
                    ? "Recherche web → présentation..."
                    : showThink && showCanvas
                    ? "Réflexion approfondie → présentation..."
                    : showSearch
                    ? "Rechercher sur le web..."
                    : showThink
                    ? "Réfléchir en profondeur..."
                    : showCanvas
                    ? "Générer une présentation..."
                    : placeholder
                }
                className="text-base"
              />
            </div>

            {/* Voice recorder */}
            {isRecording && (
              <VoiceRecorder
                isRecording={isRecording}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
              />
            )}

            {/* Actions bar */}
            <PromptInputActions className="flex items-center justify-between gap-2 p-0 pt-2">
              <div
                className={cn(
                  "flex items-center gap-1 transition-opacity duration-300",
                  isRecording ? "opacity-0 invisible h-0" : "opacity-100 visible"
                )}
              >
                {/* Upload */}
                <PromptInputAction tooltip="Joindre une image">
                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex h-10 w-10 text-muted-foreground cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-secondary/60 hover:text-foreground"
                    aria-label="Joindre une image"
                    disabled={isRecording}
                  >
                    <Paperclip className="h-5 w-5" />
                    <input
                      ref={uploadInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) processFile(e.target.files[0]);
                        if (e.target) e.target.value = "";
                      }}
                      accept="image/*"
                    />
                  </button>
                </PromptInputAction>

                {/* Mode toggles */}
                <div className="flex items-center">
                  {/* Search */}
                  <button
                    type="button"
                    onClick={() => handleToggleChange("search")}
                    className={cn(
                      "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                      showSearch
                        ? "bg-blue-500/15 border-blue-500 text-blue-500 dark:bg-blue-400/15 dark:border-blue-400 dark:text-blue-400"
                        : "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <motion.div
                        animate={{ rotate: showSearch ? 360 : 0, scale: showSearch ? 1.1 : 1 }}
                        whileHover={{
                          rotate: showSearch ? 360 : 15,
                          scale: 1.1,
                          transition: { type: "spring", stiffness: 300, damping: 10 },
                        }}
                        transition={{ type: "spring", stiffness: 260, damping: 25 }}
                      >
                        <Globe className="w-4 h-4" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {showSearch && (
                        <motion.span
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs overflow-hidden whitespace-nowrap flex-shrink-0"
                        >
                          Recherche
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  <CustomDivider />

                  {/* Think */}
                  <button
                    type="button"
                    onClick={() => handleToggleChange("think")}
                    className={cn(
                      "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                      showThink
                        ? "bg-violet-500/15 border-violet-500 text-violet-500 dark:bg-violet-400/15 dark:border-violet-400 dark:text-violet-400"
                        : "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <motion.div
                        animate={{ rotate: showThink ? 360 : 0, scale: showThink ? 1.1 : 1 }}
                        whileHover={{
                          rotate: showThink ? 360 : 15,
                          scale: 1.1,
                          transition: { type: "spring", stiffness: 300, damping: 10 },
                        }}
                        transition={{ type: "spring", stiffness: 260, damping: 25 }}
                      >
                        <BrainCog className="w-4 h-4" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {showThink && (
                        <motion.span
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs overflow-hidden whitespace-nowrap flex-shrink-0"
                        >
                          Réflexion
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  <CustomDivider />

                  {/* Canvas */}
                  <button
                    type="button"
                    onClick={handleCanvasToggle}
                    className={cn(
                      "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                      showCanvas
                        ? "bg-orange-500/15 border-orange-500 text-orange-500 dark:bg-orange-400/15 dark:border-orange-400 dark:text-orange-400"
                        : "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <motion.div
                        animate={{ rotate: showCanvas ? 360 : 0, scale: showCanvas ? 1.1 : 1 }}
                        whileHover={{
                          rotate: showCanvas ? 360 : 15,
                          scale: 1.1,
                          transition: { type: "spring", stiffness: 300, damping: 10 },
                        }}
                        transition={{ type: "spring", stiffness: 260, damping: 25 }}
                      >
                        <FolderCode className="w-4 h-4" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {showCanvas && (
                        <motion.span
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs overflow-hidden whitespace-nowrap flex-shrink-0"
                        >
                          Canvas
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </div>
              </div>

              {/* Send / Voice / Stop button */}
              <PromptInputAction
                tooltip={
                  isLoading
                    ? "Arrêter"
                    : isRecording
                    ? "Arrêter l'enregistrement"
                    : hasContent
                    ? "Envoyer"
                    : "Message vocal"
                }
              >
                <button
                  className={cn(
                    "h-10 w-10 rounded-full inline-flex items-center justify-center transition-all duration-200",
                    isLoading
                      ? "bg-red-500/10 hover:bg-red-500/20 text-red-500"
                      : isRecording
                      ? "bg-transparent hover:bg-secondary/60 text-red-500"
                      : hasContent
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "bg-transparent hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    if (isLoading) { onStop?.(); return; }
                    if (isRecording) setIsRecording(false);
                    else if (hasContent) handleSubmit();
                    else setIsRecording(true);
                  }}
                >
                  {isLoading ? (
                    <Square className="h-4 w-4 fill-current" />
                  ) : isRecording ? (
                    <StopCircle className="h-5 w-5 text-red-500" />
                  ) : hasContent ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>

          <p className="text-xs text-muted-foreground text-center mt-2">
            Board Advisor peut faire des erreurs. Vérifiez les informations importantes.
          </p>
        </div>
      </div>

      <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
