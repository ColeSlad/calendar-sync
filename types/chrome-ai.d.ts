type LanguageModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

interface LanguageModelExpectedContent {
  type: 'text';
  languages: string[];
}

interface LanguageModelDownloadProgressEvent extends Event {
  loaded: number;
}

interface LanguageModelCreateMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: LanguageModelDownloadProgressEvent) => void,
  ): void;
}

interface LanguageModelSession {
  prompt(
    input: string,
    options?: {
      responseConstraint?: Record<string, unknown>;
      omitResponseConstraintInput?: boolean;
    },
  ): Promise<string>;
  destroy(): void;
}

interface LanguageModelFactory {
  availability(options?: {
    expectedInputs?: LanguageModelExpectedContent[];
    expectedOutputs?: LanguageModelExpectedContent[];
  }): Promise<LanguageModelAvailability>;
  create(options?: {
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    expectedInputs?: LanguageModelExpectedContent[];
    expectedOutputs?: LanguageModelExpectedContent[];
    monitor?: (monitor: LanguageModelCreateMonitor) => void;
  }): Promise<LanguageModelSession>;
}

interface Window {
  LanguageModel?: LanguageModelFactory;
}

declare var LanguageModel: LanguageModelFactory | undefined;

