import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';
import { SCRIPT_FILE_RE, isSupportedScriptFile } from './saveScriptFile';

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: {
    description?: string;
    accept: Record<string, string[]>;
  }[];
  excludeAcceptAllOption?: boolean;
}

interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
}

type WindowWithOpenPicker = Window & {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandleLike[]>;
};

function openFileInputFallback(onFileSelected: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ts,.js,.mts,.mjs,.cts,.cjs,.tsx,.jsx,text/typescript,text/javascript,application/javascript';
  input.style.display = 'none';

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    input.remove();
  });

  input.addEventListener('cancel', () => {
    input.remove();
  });

  document.body.appendChild(input);
  input.click();
}

export async function loadScriptFile(file?: File): Promise<void> {
  const { setCode, setFileName } = usePlaygroundStore.getState();
  const { addToast } = useToastStore.getState();

  const processFile = async (selectedFile: File) => {
    if (!isSupportedScriptFile(selectedFile)) {
      addToast('Unsupported file — select a .js or .ts file');
      return;
    }
    try {
      const content = await selectedFile.text();
      if (window.location.pathname !== import.meta.env.BASE_URL) {
        history.replaceState(null, '', import.meta.env.BASE_URL);
      }
      setFileName(selectedFile.name);
      setCode(content);
      addToast(`Loaded ${selectedFile.name}`);
    } catch {
      addToast(`Failed to read ${selectedFile.name}`);
    }
  };

  if (file) {
    await processFile(file);
    return;
  }

  const win = window as WindowWithOpenPicker;
  if (typeof win.showOpenFilePicker === 'function') {
    try {
      const [handle] = await win.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'CAD Script Files (*.ts, *.js, *.mts, *.mjs, *.cts, *.cjs)',
            accept: {
              'text/typescript': ['.ts', '.mts', '.cts', '.tsx'],
              'text/javascript': ['.js', '.mjs', '.cjs', '.jsx'],
              'text/plain': ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'],
            },
          },
          {
            description: 'TypeScript Files (*.ts, *.mts, *.cts)',
            accept: {
              'text/typescript': ['.ts', '.mts', '.cts', '.tsx'],
              'text/plain': ['.ts', '.mts', '.cts', '.tsx'],
            },
          },
          {
            description: 'JavaScript Files (*.js, *.mjs, *.cjs)',
            accept: {
              'text/javascript': ['.js', '.mjs', '.cjs', '.jsx'],
              'text/plain': ['.js', '.mjs', '.cjs', '.jsx'],
            },
          },
        ],
      });
      if (handle) {
        const pickedFile = await handle.getFile();
        await processFile(pickedFile);
      }
      return;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      // Fall through to input fallback if showOpenFilePicker failed for any other reason
    }
  }

  openFileInputFallback((selectedFile) => {
    void processFile(selectedFile);
  });
}
